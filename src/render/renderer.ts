import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { BoxDef, MapDef } from '../data/types'
import { terrainHeight } from '../data/maps'
import { buildKit, isKitBox } from './kit'
import { buildStructures } from './structure'
import { getGroundTexture, getRockTexture, getSurfaceNormal } from './kitTextures'
import { weapon as weaponDef } from '../data/weapons'
import type { Vec3 } from '../core/math'
import { clamp, damp, lenXZ, yawRight } from '../core/math'
import type { SimEvent, World } from '../sim/types'
import {
  getAsphaltTexture,
  getBrickTexture,
  getConcreteTexture,
  getCorrugatedMetalTexture,
  getGlassTexture,
  getHazardStripeTexture,
  getHelmetTexture,
  getJungleFoliageTexture,
  getMetalPanelTexture,
  getPlayerArmorTexture,
  getRoofGravelTexture,
  getTreeBarkTexture,
  getVisorEmissiveTexture,
  getWeaponTexture,
  getWoodCrateTexture,
} from './textures'

const MAX_TRACERS = 128
const MAX_RINGS = 16

function buildTerrainMesh(map: MapDef): THREE.Mesh | null {
  if (!map.terrain) return null

  const bounds = map.bounds ?? 120
  const segments = 96
  const stride = segments + 1
  const positions: number[] = []
  const colors: number[] = []
  const heights: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const low = new THREE.Color(map.id === 'skyfoundry' ? 0x3c5635 : map.id === 'hollow-ward' ? 0x626449 : 0x5c5b50)
  const high = new THREE.Color(map.id === 'skyfoundry' ? 0x73865a : map.id === 'hollow-ward' ? 0x8c8059 : 0x847b68)

  for (let zIndex = 0; zIndex <= segments; zIndex++) {
    const z = -bounds + (2 * bounds * zIndex) / segments
    for (let xIndex = 0; xIndex <= segments; xIndex++) {
      const x = -bounds + (2 * bounds * xIndex) / segments
      const height = terrainHeight(map, x, z)
      heights.push(height)
      positions.push(x, height + 0.025, z)
      const color = low.clone().lerp(high, Math.min(1, height / Math.max(1, map.terrain.amplitude)))
      colors.push(color.r, color.g, color.b)
      uvs.push(x / 14, z / 14)
    }
  }

  for (let zIndex = 0; zIndex < segments; zIndex++) {
    for (let xIndex = 0; xIndex < segments; xIndex++) {
      const a = zIndex * stride + xIndex
      const b = a + 1
      const c = a + stride
      const d = c + 1
      if (Math.max(heights[a], heights[b], heights[c], heights[d]) < 0.02) continue
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const groundTexture = map.id === 'skyfoundry' ? getGroundTexture() : null
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: groundTexture ?? undefined,
    roughness: 0.95,
  })
  if (groundTexture) material.normalMap = getSurfaceNormal(groundTexture, 0.55)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  mesh.castShadow = true
  return mesh
}

function isOrganicBox(box: BoxDef): boolean {
  return box.kind === 'trunk' || box.kind === 'foliage'
}

interface Tracer {
  from: Vec3
  to: Vec3
  life: number
  maxLife: number
  color: number
}

interface Ring {
  mesh: THREE.Mesh
  life: number
  maxLife: number
  maxRadius: number
}

interface PlayerMesh {
  group: THREE.Group
  body: THREE.Mesh
  head: THREE.Mesh
  visor: THREE.Mesh
  gun?: THREE.Mesh
  muzzleFlash: THREE.Mesh
  target: Vec3
}

/** Accent colour + surface pattern for each weapon's procedural skin. */
const WEAPON_SKINS: Record<string, { accent: string; pattern: 'camo' | 'carbon' | 'tech' }> = {
  reaper: { accent: '#ff8a3c', pattern: 'camo' },
  breacher: { accent: '#ff5a4d', pattern: 'camo' },
  warhound: { accent: '#ffc85a', pattern: 'camo' },
  gilded: { accent: '#ffd54a', pattern: 'tech' },
  ghostline: { accent: '#63e6ff', pattern: 'tech' },
  katana: { accent: '#4de8ff', pattern: 'carbon' },
  hellfire: { accent: '#ff8a3c', pattern: 'camo' },
  phantom: { accent: '#22e6ff', pattern: 'tech' },
  cyclone: { accent: '#5cff6a', pattern: 'carbon' },
  thunderclap: { accent: '#b06bff', pattern: 'tech' },
  specter: { accent: '#ff3b5c', pattern: 'carbon' },
  aurora: { accent: '#8fd8ff', pattern: 'tech' },
  scythe: { accent: '#ff7a2f', pattern: 'carbon' },
  vortex: { accent: '#ffb648', pattern: 'tech' },
  verdict: { accent: '#66e0c8', pattern: 'camo' },
  tempest: { accent: '#ffb14d', pattern: 'camo' },
  cinder: { accent: '#ff6a33', pattern: 'camo' },
  kris: { accent: '#ff5ce1', pattern: 'carbon' },
}

/** Builds an intricate first-person viewmodel with textured surfaces and glowing blooming accents. */
function buildViewModel(weaponId: string): THREE.Group {
  const group = new THREE.Group()

  // Standard PBR materials
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1c212a, roughness: 0.35, metalness: 0.85 })
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x38414e, roughness: 0.45, metalness: 0.75 })
  const tacticalTan = new THREE.MeshStandardMaterial({ color: 0x5a4f40, roughness: 0.75, metalness: 0.15 })
  const oliveDrab = new THREE.MeshStandardMaterial({ color: 0x3d4737, roughness: 0.7, metalness: 0.2 })
  const carbonFiber = new THREE.MeshStandardMaterial({ color: 0x12151b, roughness: 0.25, metalness: 0.6 })
  const goldMetal = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 })
  const polishedSteel = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.15, metalness: 0.95 })

  // Bind the procedural weapon skin so every surface carries real material detail.
  const skin = WEAPON_SKINS[weaponId] ?? { accent: '#7fd4ff', pattern: 'carbon' as const }
  gunmetal.map = getWeaponTexture(skin.accent, skin.pattern)
  darkMetal.map = getWeaponTexture(skin.accent, 'carbon')
  carbonFiber.map = getWeaponTexture(skin.accent, 'carbon')
  tacticalTan.map = getWeaponTexture(skin.accent, 'camo')
  oliveDrab.map = getWeaponTexture(skin.accent, 'camo')
  polishedSteel.map = getWeaponTexture(skin.accent, 'tech')

  // Subtle emissive accents; muzzle flashes are handled separately.
  const bloomAmber = new THREE.MeshStandardMaterial({ color: 0xff9900, emissive: 0xff7700, emissiveIntensity: 1.0, roughness: 0.2 })
  const bloomOrange = new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xff4400, emissiveIntensity: 1.0, roughness: 0.2 })
  const bloomRed = new THREE.MeshStandardMaterial({ color: 0xff1133, emissive: 0xff0022, emissiveIntensity: 1.0, roughness: 0.2 })
  const bloomCyan = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00e5ff, emissiveIntensity: 1.0, roughness: 0.15 })
  const bloomIceBlue = new THREE.MeshStandardMaterial({ color: 0x7fe3ff, emissive: 0x38bdf8, emissiveIntensity: 1.0, roughness: 0.15 })
  const bloomGreen = new THREE.MeshStandardMaterial({ color: 0x39ff14, emissive: 0x22ee11, emissiveIntensity: 1.0, roughness: 0.2 })
  const bloomPurple = new THREE.MeshStandardMaterial({ color: 0xbf00ff, emissive: 0xa855f7, emissiveIntensity: 1.0, roughness: 0.2 })
  const bloomGold = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xf59e0b, emissiveIntensity: 1.0, roughness: 0.2 })

  const add = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    group.add(mesh)
    return mesh
  }

  switch (weaponId) {
    case 'reaper': // AK-74 "Reaper"
      add(0.1, 0.12, 0.95, 0, 0, -0.32, gunmetal) // receiver
      add(0.05, 0.05, 0.55, 0, 0.02, -0.95, darkMetal) // barrel
      add(0.08, 0.22, 0.14, 0, -0.16, -0.22, darkMetal) // curved banana mag
      add(0.08, 0.12, 0.35, 0, -0.04, 0.25, tacticalTan) // wooden stock
      add(0.09, 0.08, 0.32, 0, 0.01, -0.55, tacticalTan) // handguard
      add(0.04, 0.04, 0.42, 0, 0.075, -0.45, gunmetal) // gas tube
      add(0.03, 0.05, 0.03, 0, 0.08, -0.85, darkMetal) // front sight post
      break

    case 'breacher': // Pump "Breacher" Shotgun
      add(0.13, 0.15, 0.82, 0, 0, -0.28, darkMetal) // heavy receiver
      add(0.08, 0.08, 0.65, 0, 0.05, -0.85, gunmetal) // twin magazine & barrel
      add(0.12, 0.1, 0.3, 0, -0.02, -0.58, carbonFiber) // ribbed pump forend
      add(0.12, 0.08, 0.28, 0, -0.08, -0.08, darkMetal) // pistol grip
      add(0.04, 0.04, 0.55, 0, 0.11, -0.65, bloomRed) // glowing crimson barrel rib
      add(0.05, 0.06, 0.08, 0, 0.11, -0.15, bloomRed) // holographic reflex sight dot
      break

    case 'warhound': // MG "Warhound" Belt-Fed
      add(0.15, 0.16, 1.05, 0, 0.02, -0.35, gunmetal) // heavy box receiver
      add(0.09, 0.09, 0.5, 0, 0.04, -0.95, darkMetal) // heavy barrel shroud
      add(0.24, 0.18, 0.26, -0.12, -0.08, -0.25, oliveDrab) // side drum ammo canister
      add(0.06, 0.18, 0.12, 0, -0.16, 0.05, darkMetal) // spade grip
      add(0.06, 0.06, 0.35, 0, 0.13, -0.25, gunmetal) // carry handle
      add(0.12, 0.03, 0.14, 0.02, 0.11, -0.15, bloomGold) // glowing ammo counter digital display
      add(0.03, 0.03, 0.65, 0.06, 0.06, -0.7, bloomAmber) // glowing status heat sink
      break

    case 'gilded': // Golden Eagle "Gilded Judge"
      add(0.08, 0.11, 0.42, 0, 0.03, -0.22, goldMetal) // gold slide
      add(0.06, 0.16, 0.14, 0, -0.11, -0.02, darkMetal) // ergonomic grip
      add(0.07, 0.09, 0.22, 0, 0.03, -0.42, polishedSteel) // compensator
      add(0.025, 0.025, 0.36, 0, 0.08, -0.24, bloomGold) // glowing gold top sight rail
      add(0.03, 0.03, 0.06, 0, -0.04, -0.34, bloomGold) // glowing tactical laser emitter
      break

    case 'ghostline': // Bolt-Action Rail "Ghostline"
      add(0.09, 0.11, 1.25, 0, 0, -0.38, carbonFiber) // lightweight polymer stock
      add(0.05, 0.05, 0.75, 0, 0.02, -1.22, gunmetal) // fluted rail barrel
      add(0.12, 0.14, 0.34, 0, 0.12, -0.15, darkMetal) // high-magnification sniper scope
      add(0.08, 0.08, 0.02, 0, 0.12, -0.32, bloomCyan) // glowing cyan scope front lens
      add(0.04, 0.04, 0.85, 0, 0.04, -0.65, bloomIceBlue) // glowing rail acceleration conduits
      add(0.04, 0.12, 0.04, 0.08, 0.04, -0.05, polishedSteel) // bolt handle
      break

    case 'katana': // Katana
      add(0.04, 0.04, 0.38, 0.02, -0.06, -0.12, darkMetal) // tsuka braided handle
      add(0.14, 0.14, 0.02, 0.02, -0.06, -0.32, goldMetal) // square tsuba guard
      add(0.015, 0.05, 1.15, 0.02, -0.04, -0.92, polishedSteel) // polished blade spine
      add(0.008, 0.02, 1.14, 0.02, -0.06, -0.92, bloomCyan) // glowing cyan energy cutting edge
      add(0.03, 0.03, 0.03, 0.02, -0.06, 0.08, bloomCyan) // glowing pommel core
      break

    case 'hellfire': // RPG "Hellfire"
      add(0.18, 0.18, 1.25, 0, 0.04, -0.32, oliveDrab) // launcher launch tube
      add(0.22, 0.22, 0.32, 0, 0.04, -1.02, darkMetal) // forward warhead flare
      add(0.08, 0.16, 0.1, 0, -0.14, -0.1, darkMetal) // front grip
      add(0.1, 0.1, 0.18, -0.12, 0.12, -0.3, darkMetal) // target acquisition scope
      add(0.08, 0.08, 0.02, -0.12, 0.12, -0.39, bloomOrange) // glowing targeting HUD lens
      add(0.16, 0.04, 0.35, 0, 0.12, -0.22, bloomAmber) // glowing hazard stripes & lock status
      break

    case 'phantom': // Plasma Carbine "Phantom-9"
      add(0.11, 0.14, 0.92, 0, 0, -0.3, gunmetal) // bullpup chassis
      add(0.07, 0.08, 0.45, 0, 0.02, -0.85, carbonFiber) // plasma accelerator barrel
      add(0.09, 0.15, 0.14, 0, -0.12, 0.08, darkMetal) // rear magazine well
      add(0.08, 0.12, 0.22, 0, 0.11, -0.18, darkMetal) // holographic sight frame
      add(0.05, 0.06, 0.02, 0, 0.11, -0.28, bloomCyan) // glowing holographic targeting reticle
      // Three glowing plasma containment coils inside the weapon body
      add(0.06, 0.06, 0.18, 0, 0.03, -0.35, bloomCyan) // coil 1
      add(0.05, 0.05, 0.18, 0, 0.03, -0.6, bloomCyan) // coil 2
      add(0.08, 0.03, 0.45, 0, 0.07, -0.48, bloomIceBlue) // top cooling rail
      break

    case 'cyclone': // Dual SMGs "Cyclone-X"
      // Right SMG
      add(0.08, 0.12, 0.58, 0.14, -0.06, -0.32, darkMetal)
      add(0.05, 0.05, 0.25, 0.14, -0.04, -0.65, gunmetal)
      add(0.05, 0.2, 0.08, 0.14, -0.2, -0.26, carbonFiber)
      add(0.02, 0.18, 0.04, 0.14, -0.19, -0.24, bloomGreen) // glowing neon-green mag strip
      add(0.04, 0.04, 0.04, 0.14, 0.02, -0.7, bloomGreen) // glowing muzzle compensator
      // Left SMG
      add(0.08, 0.12, 0.58, -0.14, -0.08, -0.36, darkMetal)
      add(0.05, 0.05, 0.25, -0.14, -0.06, -0.69, gunmetal)
      add(0.05, 0.2, 0.08, -0.14, -0.22, -0.3, carbonFiber)
      add(0.02, 0.18, 0.04, -0.14, -0.21, -0.28, bloomGreen) // glowing neon-green mag strip
      add(0.04, 0.04, 0.04, -0.14, 0.0, -0.74, bloomGreen) // glowing muzzle compensator
      break

    case 'thunderclap': // Sawed-Off "Thunderclap"
      add(0.15, 0.13, 0.68, 0, -0.02, -0.24, gunmetal) // break action frame
      add(0.08, 0.08, 0.52, -0.04, 0.02, -0.68, darkMetal) // left barrel
      add(0.08, 0.08, 0.52, 0.04, 0.02, -0.68, darkMetal) // right barrel
      add(0.09, 0.1, 0.24, 0, -0.08, -0.02, tacticalTan) // cut-off wooden stock
      add(0.03, 0.05, 0.04, -0.04, 0.06, -0.15, polishedSteel) // left hammer
      add(0.03, 0.05, 0.04, 0.04, 0.06, -0.15, polishedSteel) // right hammer
      add(0.025, 0.025, 0.48, 0, 0.05, -0.66, bloomPurple) // glowing violet arc electrode
      add(0.03, 0.03, 0.04, 0, 0.06, -0.88, bloomPurple) // glowing purple bead sight
      break

    case 'specter': // Tactical Suppressed "Specter .45"
      add(0.07, 0.1, 0.36, 0, 0.02, -0.2, gunmetal) // slide
      add(0.06, 0.16, 0.11, 0, -0.1, 0.0, carbonFiber) // textured combat grip
      add(0.09, 0.09, 0.45, 0, 0.03, -0.58, darkMetal) // cylindrical suppressor
      add(0.025, 0.025, 0.35, 0, -0.04, -0.32, bloomRed) // glowing crimson tactical laser
      add(0.02, 0.03, 0.02, 0, 0.08, -0.34, bloomRed) // glowing red front night sight
      add(0.04, 0.03, 0.02, 0, 0.08, -0.08, bloomRed) // glowing red rear night sight
      break

    case 'aurora': // Coilgun "Aurora Beam"
      add(0.1, 0.12, 1.25, 0, 0, -0.4, darkMetal) // heavy magnetic receiver
      add(0.06, 0.06, 0.85, 0, 0.02, -1.25, polishedSteel) // central accelerator core
      add(0.11, 0.13, 0.3, 0, 0.12, -0.18, carbonFiber) // optic housing
      add(0.07, 0.07, 0.02, 0, 0.12, -0.32, bloomIceBlue) // glowing prism lens
      add(0.03, 0.03, 0.95, -0.05, 0.02, -0.75, bloomIceBlue) // left superconductor rail
      add(0.03, 0.03, 0.95, 0.05, 0.02, -0.75, bloomIceBlue) // right superconductor rail
      add(0.02, 0.06, 0.25, 0, 0.07, -0.45, bloomCyan) // power indicator display
      break

    case 'scythe': // Thermal Blades "Voidfang"
      // Right thermal sickle
      add(0.04, 0.04, 0.32, 0.12, -0.08, -0.15, carbonFiber)
      add(0.1, 0.08, 0.02, 0.12, -0.08, -0.32, darkMetal)
      add(0.015, 0.08, 0.75, 0.12, -0.02, -0.65, darkMetal)
      add(0.01, 0.03, 0.75, 0.12, -0.05, -0.65, bloomOrange) // glowing superheated cutting edge
      // Left thermal sickle
      add(0.04, 0.04, 0.32, -0.12, -0.08, -0.15, carbonFiber)
      add(0.1, 0.08, 0.02, -0.12, -0.08, -0.32, darkMetal)
      add(0.015, 0.08, 0.75, -0.12, -0.02, -0.65, darkMetal)
      add(0.01, 0.03, 0.75, -0.12, -0.05, -0.65, bloomOrange) // glowing superheated cutting edge
      break

    case 'vortex': // Launcher "Vortex-6" Micro-Missile
      add(0.24, 0.22, 0.95, 0.04, 0.04, -0.35, gunmetal) // 6-tube pod housing
      add(0.08, 0.18, 0.12, 0, -0.14, -0.1, darkMetal) // pistol grip
      add(0.08, 0.1, 0.16, -0.14, 0.12, -0.25, carbonFiber) // targeting computer
      add(0.06, 0.06, 0.02, -0.14, 0.12, -0.34, bloomAmber) // glowing guidance HUD
      // Six glowing micro-warhead caps arranged hexagonally in the front
      const hexCoords = [
        [-0.04, 0.08], [0.04, 0.08],
        [-0.07, 0.02], [0.07, 0.02],
        [-0.04, -0.04], [0.04, -0.04],
      ]
      for (const [hx, hy] of hexCoords) {
        add(0.04, 0.04, 0.04, hx + 0.04, hy + 0.04, -0.84, bloomOrange) // glowing warheads
      }
      break

    case 'verdict': // Marksman Rifle "Verdict"
      add(0.09, 0.11, 1.3, 0, 0, -0.42, tacticalTan) // chassis
      add(0.055, 0.055, 0.95, 0, 0.02, -1.25, gunmetal) // long accelerator barrel
      add(0.1, 0.12, 0.4, 0, 0.13, -0.2, darkMetal) // scope body
      add(0.08, 0.08, 0.02, 0, 0.13, -0.41, bloomIceBlue) // glowing scope lens
      add(0.03, 0.03, 0.6, 0, 0.06, -0.9, bloomCyan) // glowing under-barrel rail
      add(0.08, 0.2, 0.1, 0, -0.15, -0.2, darkMetal) // box magazine
      add(0.06, 0.1, 0.28, 0, -0.05, 0.22, carbonFiber) // precision stock
      break

    case 'tempest': // LMG "Tempest"
      add(0.16, 0.17, 1.1, 0, 0.02, -0.35, oliveDrab) // heavy receiver
      add(0.25, 0.22, 0.22, 0.14, -0.1, -0.18, darkMetal) // belt feed box
      add(0.08, 0.08, 0.55, 0, 0.05, -1.0, gunmetal) // barrel shroud
      add(0.05, 0.05, 0.7, 0, 0.15, -0.62, bloomAmber) // glowing heat rail
      add(0.1, 0.04, 0.12, 0.02, 0.12, -0.1, bloomGold) // ammo counter
      add(0.06, 0.14, 0.1, 0, -0.15, 0.05, carbonFiber) // pistol grip
      break

    case 'cinder': // Grenade Launcher "Cinder"
      add(0.17, 0.17, 0.95, 0, 0.04, -0.3, oliveDrab) // launcher body
      add(0.22, 0.22, 0.26, 0, 0.04, -0.82, darkMetal) // revolving cylinder
      add(0.05, 0.05, 0.05, -0.06, 0.04, -0.96, bloomOrange) // loaded warhead
      add(0.05, 0.05, 0.05, 0.06, 0.04, -0.96, bloomOrange) // loaded warhead
      add(0.08, 0.16, 0.12, 0, -0.14, -0.05, carbonFiber) // grip
      add(0.12, 0.1, 0.28, 0, -0.04, 0.28, tacticalTan) // folding stock
      add(0.03, 0.03, 0.4, 0, 0.13, -0.45, bloomAmber) // targeting strip
      break

    case 'kris': // Dagger "Kris"
      add(0.04, 0.03, 0.3, 0.02, -0.06, -0.12, carbonFiber) // wrapped handle
      add(0.12, 0.03, 0.04, 0.02, -0.06, -0.28, goldMetal) // cross guard
      add(0.015, 0.06, 0.55, 0.02, -0.04, -0.6, polishedSteel) // wavy blade
      add(0.008, 0.02, 0.5, 0.02, -0.04, -0.62, bloomPurple) // glowing venom edge
      add(0.03, 0.03, 0.03, 0.02, -0.05, 0.06, bloomPurple) // pommel core
      break

    default: // Generic fallback
      add(0.1, 0.11, 0.8, 0, 0, -0.32, gunmetal)
      add(0.06, 0.06, 0.45, 0, 0.02, -0.8, darkMetal)
      add(0.12, 0.16, 0.2, 0, -0.06, -0.02, gunmetal)
      add(0.03, 0.03, 0.5, 0, 0.075, -0.4, bloomCyan)
      break
  }

  // Operator Hands (tactical glove material)
  const glove = new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.8, metalness: 0.1 })
  add(0.09, 0.11, 0.2, 0.01, -0.11, -0.02, glove)
  add(0.09, 0.1, 0.16, -0.02, -0.1, -0.42, glove)

  return group
}

export class GameRenderer {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private bloomPass: UnrealBloomPass
  private mapGroup = new THREE.Group()
  private players = new Map<number, PlayerMesh>()
  private tracers: Tracer[] = []
  private rings: Ring[] = []
  private tracerLines: THREE.LineSegments
  private tracerPositions: Float32Array
  private tracerColors: Float32Array
  private viewmodelHolder = new THREE.Group()
  private viewmodel: THREE.Group | null = null
  private currentWeaponId = ''
  private enemyMuzzleTimers = new Map<number, number>()
  private grappleRopes: [THREE.Line, THREE.Line]
  private grappleTips: [THREE.Mesh, THREE.Mesh]
  private explosionLight: THREE.PointLight
  private headlamp: THREE.PointLight
  private aimBlend = 0
  private orbMesh: THREE.InstancedMesh | null = null
  private projectileMesh: THREE.InstancedMesh | null = null
  private sun: THREE.DirectionalLight
  private hemiLight: THREE.HemisphereLight
  private fillLight: THREE.DirectionalLight
  private ambientLight: THREE.AmbientLight
  private bobPhase = 0
  private shake = 0
  private fovKick = 0

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.35

    this.camera = new THREE.PerspectiveCamera(100, 1, 0.05, 500)
    this.camera.rotation.order = 'YXZ'
    this.camera.add(this.viewmodelHolder)
    // The camera must be in the scene graph for its viewmodel children to render.
    this.scene.add(this.camera)
    const makeRope = (color: number) => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3))
      const rope = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      )
      rope.frustumCulled = false
      return rope
    }
    this.grappleRopes = [makeRope(0x58ddff), makeRope(0xffa45b)]
    this.grappleTips = [
      new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x58ddff, toneMapped: false }),
      ),
      new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffa45b, toneMapped: false }),
      ),
    ]
    this.scene.add(...this.grappleRopes, ...this.grappleTips)

    // Sun & lighting setup
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 180
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.radius = 2.5
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera
    cam.left = -65
    cam.right = 65
    cam.top = 65
    cam.bottom = -65
    this.scene.add(this.sun, this.sun.target)

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x111622, 0.6)
    this.scene.add(this.hemiLight)

    // Fill + ambient lift the shadow side of geometry so detail stays readable.
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.12)
    this.scene.add(this.ambientLight)
    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.35)
    this.fillLight.position.set(-40, 30, -50)
    this.scene.add(this.fillLight)

    // Explosion light
    this.explosionLight = new THREE.PointLight(0xff7722, 0, 30, 2)
    this.scene.add(this.explosionLight)

    // Operator headlamp: keeps unlit interiors and night maps readable without
    // flattening the map's own lighting outside.
    this.headlamp = new THREE.PointLight(0xffe6c4, 1.15, 26, 1.8)
    this.headlamp.position.set(0, 0.05, -0.15)
    this.camera.add(this.headlamp)

    // Tracers
    const geo = new THREE.BufferGeometry()
    this.tracerPositions = new Float32Array(MAX_TRACERS * 6)
    this.tracerColors = new Float32Array(MAX_TRACERS * 6)
    geo.setAttribute('position', new THREE.BufferAttribute(this.tracerPositions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.tracerColors, 3))
    this.tracerLines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.98,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.tracerLines.frustumCulled = false
    this.scene.add(this.tracerLines)

    // Post-processing EffectComposer with UnrealBloomPass
    this.composer = new EffectComposer(this.renderer)
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.3,
      0.35,
      1.0,
    )
    this.composer.addPass(this.bloomPass)

    const outputPass = new OutputPass()
    this.composer.addPass(outputPass)

    window.addEventListener('resize', this.resize)
    this.resize()
  }

  resize = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.bloomPass.resolution.set(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  setMap(map: MapDef): void {
    this.scene.fog = new THREE.Fog(map.fog.color, map.fog.near, map.fog.far)
    this.scene.background = new THREE.Color(map.sky)
    this.hemiLight.color.setHex(0xffffff)
    this.hemiLight.groundColor.setHex(0x59616d)
    this.hemiLight.intensity = Math.max(1.5, map.ambient.intensity)
    this.ambientLight.color.setHex(0xffffff)
    this.ambientLight.intensity = 2.5
    this.fillLight.color.setHex(map.sun.color)
    this.fillLight.intensity = map.sun.intensity * 0.7
    this.fillLight.position.set(-map.sun.dir[0] * 55, 45, -map.sun.dir[2] * 55)
    this.sun.color.setHex(map.sun.color)
    this.sun.intensity = map.sun.intensity
    this.sun.position.set(map.sun.dir[0] * 70, map.sun.dir[1] * 70, map.sun.dir[2] * 70)
    this.sun.target.position.set(0, 0, 0)

    this.scene.remove(this.mapGroup)
    this.mapGroup = new THREE.Group()
    this.scene.add(this.mapGroup)
    const terrain = buildTerrainMesh(map)
    if (terrain) this.mapGroup.add(terrain)

    // Group boxes by composite material key: texture + color + glass transparency
    const byKey = new Map<
      string,
      {
        texture?: string
        color: number
        kind?: string
        boxes: Array<{ pos: [number, number, number]; size: [number, number, number] }>
      }
    >()

    for (const b of map.boxes) {
      if (isOrganicBox(b) || isKitBox(b)) continue
      const color = b.color ?? 0x333333
      const key = `${b.texture ?? 'notex'}_${b.kind ?? 'nokind'}_${color}`
      let entry = byKey.get(key)
      if (!entry) {
        entry = { texture: b.texture, color, kind: b.kind, boxes: [] }
        byKey.set(key, entry)
      }
      entry.boxes.push({ pos: b.pos, size: b.size })
    }

    const unit = new THREE.BoxGeometry(1, 1, 1)

    for (const [, entry] of byKey) {
      const { texture, color, kind, boxes } = entry
      let material: THREE.Material

      if (kind === 'glass' || color === 0x8fc4d8) {
        material = new THREE.MeshStandardMaterial({
          color: 0x8fc4d8,
          transparent: true,
          opacity: 0.3,
          roughness: 0.1,
          metalness: 0.9,
        })
      } else {
        const mat = new THREE.MeshStandardMaterial({ color })
        mat.roughness = 0.7
        mat.metalness = 0.15

        if (texture === 'brick') {
          mat.map = getBrickTexture()
          mat.roughness = 0.85
          mat.metalness = 0.05
        } else if (texture === 'concrete') {
          mat.map = getConcreteTexture()
          mat.roughness = 0.8
          mat.metalness = 0.05
        } else if (texture === 'metal') {
          mat.map = getMetalPanelTexture()
          mat.roughness = 0.35
          mat.metalness = 0.8
        } else if (texture === 'hazard') {
          mat.map = getHazardStripeTexture()
          mat.roughness = 0.45
          mat.metalness = 0.2
        } else if (texture === 'woodCrate') {
          mat.map = getWoodCrateTexture()
          mat.roughness = 0.8
          mat.metalness = 0.05
        } else if (texture === 'bark') {
          mat.map = getTreeBarkTexture()
          mat.roughness = 0.95
          mat.metalness = 0.0
        } else if (texture === 'foliage') {
          mat.map = getJungleFoliageTexture()
          mat.roughness = 0.65
          mat.metalness = 0.0
        } else if (texture === 'cliff') {
          mat.map = getRockTexture()
          mat.roughness = 0.95
          mat.metalness = 0.02
        } else if (texture === 'ground') {
          mat.map = getGroundTexture()
          mat.roughness = 0.95
          mat.metalness = 0.0
        } else if (texture === 'asphalt') {
          mat.map = getAsphaltTexture()
          mat.roughness = 0.9
          mat.metalness = 0.1
        } else if (texture === 'roofGravel') {
          mat.map = getRoofGravelTexture()
          mat.roughness = 0.95
          mat.metalness = 0.05
        } else if (texture === 'corrugated') {
          mat.map = getCorrugatedMetalTexture()
          mat.roughness = 0.4
          mat.metalness = 0.75
        } else if (texture === 'glass') {
          mat.map = getGlassTexture()
          mat.roughness = 0.12
          mat.metalness = 0.85
        }

        // Scale texture tiling to the group's real-world dimensions so large
        // walls and floors no longer smear a single tile across the surface.
        if (mat.map) {
          mat.normalMap = getSurfaceNormal(mat.map, 0.7)
          mat.color.setHex(0xffffff)
          let span = 0
          let rise = 0
          for (const b of boxes) {
            span += Math.max(b.size[0], b.size[2])
            rise += b.size[1]
          }
          span /= Math.max(1, boxes.length)
          rise /= Math.max(1, boxes.length)
          const horizontal = kind === 'floor' || kind === 'roof' || kind === 'catwalk'
          const tex = mat.map.clone()
          tex.needsUpdate = true
          tex.wrapS = THREE.RepeatWrapping
          tex.wrapT = THREE.RepeatWrapping
          const rx = clamp((mat.map.repeat.x * span) / 6, 1, 18)
          const ry = horizontal
            ? clamp((mat.map.repeat.y * span) / 6, 1, 18)
            : clamp((mat.map.repeat.y * rise) / 4, 1, 12)
          tex.repeat.set(rx, ry)
          mat.map = tex
        }
        material = mat
      }

      const mesh = new THREE.InstancedMesh(unit, material, boxes.length)
      const isTranslucent = (material as THREE.MeshStandardMaterial).transparent
      mesh.castShadow = !isTranslucent
      mesh.receiveShadow = true

      const matrix = new THREE.Matrix4()
      boxes.forEach((b, i) => {
        matrix.compose(
          new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]),
          new THREE.Quaternion(),
          new THREE.Vector3(b.size[0], b.size[1], b.size[2]),
        )
        mesh.setMatrixAt(i, matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      this.mapGroup.add(mesh)
    }

    // Trees are entirely prefab-built by the kit (trunks, roots, canopy).
    this.mapGroup.add(buildKit(map))
    // Construction detail layered over the plain building boxes.
    this.mapGroup.add(buildStructures(map))

    // Shared glowing orb + projectile pooled meshes
    if (this.orbMesh) this.scene.remove(this.orbMesh)
    const orbGeo = new THREE.IcosahedronGeometry(0.35, 1)
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x55ffaa,
      emissive: 0x33ff99,
      emissiveIntensity: 3.0,
      roughness: 0.2,
      metalness: 0.1,
    })
    this.orbMesh = new THREE.InstancedMesh(orbGeo, orbMat, 48)
    this.orbMesh.frustumCulled = false
    this.scene.add(this.orbMesh)

    if (this.projectileMesh) this.scene.remove(this.projectileMesh)
    const projGeo = new THREE.SphereGeometry(0.22, 8, 6)
    const projMat = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xff7700,
      emissiveIntensity: 3.5,
      roughness: 0.2,
    })
    this.projectileMesh = new THREE.InstancedMesh(projGeo, projMat, 36)
    this.projectileMesh.frustumCulled = false
    this.scene.add(this.projectileMesh)
  }

  setViewmodel(weaponId: string | null): void {
    const id = weaponId ?? ''
    if (id === this.currentWeaponId) return
    this.currentWeaponId = id
    if (this.viewmodel) this.viewmodelHolder.remove(this.viewmodel)
    this.viewmodel = null
    if (!id) return
    this.viewmodel = buildViewModel(id)
    this.viewmodelHolder.add(this.viewmodel)
  }

  handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'shot') {
        if (e.tracer) {
          this.tracers.push({
            from: { ...e.from },
            to: { ...e.to },
            life: 0.08,
            maxLife: 0.08,
            color: e.color,
          })
        }
        if (e.playerId !== 0 && weaponDef(e.weaponId).type !== 'blade') {
          this.enemyMuzzleTimers.set(e.playerId, 0.045)
        }
      } else if (e.type === 'explosion') {
        this.spawnRing(e.pos, e.radius)
        this.shake = Math.min(0.55, this.shake + 0.3)
        this.explosionLight.position.set(e.pos.x, e.pos.y + 0.5, e.pos.z)
        this.explosionLight.intensity = 6.0
      } else if (e.type === 'hit') {
        this.shake = Math.min(0.4, this.shake + 0.04)
      }
    }
  }

  private spawnRing(pos: Vec3, radius: number): void {
    if (this.rings.length >= MAX_RINGS) return
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.75, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(pos.x, pos.y + 0.2, pos.z)
    this.scene.add(mesh)
    this.rings.push({ mesh, life: 0.5, maxLife: 0.5, maxRadius: radius })
  }

  private syncPlayer(world: World, id: number, dt: number): void {
    const player = world.players.find((p) => p.id === id)
    if (!player) return
    let mesh = this.players.get(id)
    const isEnemy = id !== 0

    if (!mesh) {
      const group = new THREE.Group()

      // High-detail textured armored torso
      const bodyMat = new THREE.MeshStandardMaterial({
        map: getPlayerArmorTexture(isEnemy),
        color: isEnemy ? 0xcc4433 : 0x3388dd,
        roughness: 0.65,
        metalness: 0.25,
      })
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 4, 12), bodyMat)
      body.position.y = 0.95
      body.castShadow = true

      // Armored tactical helmet
      const headMat = new THREE.MeshStandardMaterial({
        map: getHelmetTexture(isEnemy),
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.5,
      })
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), headMat)
      head.position.y = 1.62
      head.castShadow = true

      // Glowing Cybernetic Visor (Blooms with UnrealBloomPass!)
      const visorColor = isEnemy ? 0xff2200 : 0x00d4ff
      const visorMat = new THREE.MeshStandardMaterial({
        map: getVisorEmissiveTexture(isEnemy ? '#ff2200' : '#00d4ff'),
        color: visorColor,
        emissive: visorColor,
        emissiveIntensity: 3.5,
        roughness: 0.15,
      })
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.12), visorMat)
      visor.position.set(0, 1.64, -0.2)

      // Shoulder armor pads
      const padMat = new THREE.MeshStandardMaterial({
        map: getPlayerArmorTexture(isEnemy),
        color: isEnemy ? 0xc0503f : 0x5a9bd8,
        roughness: 0.4,
        metalness: 0.6,
      })
      const padL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.18), padMat)
      padL.position.set(-0.38, 1.35, 0)
      const padR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.18), padMat)
      padR.position.set(0.38, 1.35, 0)

      // Third-person weapon model carried by bot/player
      const gunMat = new THREE.MeshStandardMaterial({
        map: getWeaponTexture('#9fb4c8', 'carbon'),
        color: 0x8b98a8,
        roughness: 0.4,
        metalness: 0.8,
      })
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.65), gunMat)
      gun.position.set(0.26, 1.05, -0.25)
      gun.castShadow = true

      const muzzleFlash = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xffc56e, toneMapped: false }),
      )
      muzzleFlash.position.set(0.26, 1.05, -0.62)
      muzzleFlash.visible = false

      // Chest status core, bright enough to bloom and read at a distance.
      const coreMat = new THREE.MeshStandardMaterial({
        color: visorColor,
        emissive: visorColor,
        emissiveIntensity: 2.4,
        roughness: 0.3,
      })
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.04), coreMat)
      core.position.set(0, 1.16, -0.34)

      group.add(body, head, visor, padL, padR, gun, muzzleFlash, core)
      this.scene.add(group)
      mesh = { group, body, head, visor, gun, muzzleFlash, target: { ...player.pos } }
      this.players.set(id, mesh)
    }

    mesh.target = { x: player.pos.x, y: player.pos.y, z: player.pos.z }
    const t = 1 - Math.exp(-22 * dt)
    mesh.group.position.lerp(new THREE.Vector3(mesh.target.x, mesh.target.y, mesh.target.z), t)
    mesh.group.rotation.y = player.yaw
    const visible = player.alive && id !== 0
    mesh.group.visible = visible
    const muzzleTimer = Math.max(0, (this.enemyMuzzleTimers.get(id) ?? 0) - dt)
    if (muzzleTimer > 0) this.enemyMuzzleTimers.set(id, muzzleTimer)
    else this.enemyMuzzleTimers.delete(id)
    mesh.muzzleFlash.visible = visible && muzzleTimer > 0
    const translucent = player.invisibility > 0
    const mat = mesh.body.material as THREE.MeshStandardMaterial
    mat.opacity = translucent ? 0.08 : 1
    mat.transparent = translucent
    const local = world.players[0]
    const revealed =
      isEnemy &&
      !!local &&
      local.revealUntil > world.time &&
      Math.hypot(local.pos.x - player.pos.x, local.pos.z - player.pos.z) <= local.revealRadius
    mat.emissive.setHex(revealed ? 0x1848ff : 0x000000)
    mat.emissiveIntensity = revealed ? 0.9 : 1
    mesh.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        const depthTest = !revealed
        const depthWrite = !revealed && !translucent
        if (material.depthTest !== depthTest || material.depthWrite !== depthWrite) {
          material.depthTest = depthTest
          material.depthWrite = depthWrite
          material.needsUpdate = true
        }
      }
    })
  }

  private updateGrappleRopes(player: World['players'][number] | undefined): void {
    const right = player ? yawRight(player.yaw) : null
    for (const side of [0, 1] as const) {
      const hook = player?.grapples[side]
      const visible = !!player?.alive && !!hook?.active && !!right
      const rope = this.grappleRopes[side]
      const tip = this.grappleTips[side]
      rope.visible = visible
      tip.visible = visible
      if (!visible || !player || !hook || !right) continue
      const sideOffset = side === 0 ? -0.32 : 0.32
      const startX = player.pos.x + right.x * sideOffset
      const startY = player.pos.y + player.eyeHeight * 0.7
      const startZ = player.pos.z + right.z * sideOffset
      const positions = rope.geometry.getAttribute('position') as THREE.BufferAttribute
      positions.setXYZ(0, startX, startY, startZ)
      positions.setXYZ(1, hook.anchor.x, hook.anchor.y, hook.anchor.z)
      positions.needsUpdate = true
      tip.position.set(hook.anchor.x, hook.anchor.y, hook.anchor.z)
    }
  }

  update(world: World, dt: number, localInputYawPitch?: { yaw: number; pitch: number }): void {
    const local = world.players[0]
    for (const p of world.players) this.syncPlayer(world, p.id, dt)
    this.updateGrappleRopes(local)

    // Drop meshes for players that no longer exist
    for (const [id, mesh] of this.players) {
      if (!world.players.some((p) => p.id === id)) {
        this.scene.remove(mesh.group)
        this.players.delete(id)
      }
    }

    if (local) {
      const speed = lenXZ(local.vel)
      this.bobPhase += dt * (4 + speed * 1.1)
      const bob = local.onGround ? Math.sin(this.bobPhase * 2) * Math.min(0.035, speed * 0.004) : 0
      const eyeY = local.pos.y + local.eyeHeight + bob
      this.camera.position.set(local.pos.x, eyeY, local.pos.z)
      const yaw = localInputYawPitch?.yaw ?? local.yaw
      const pitch = localInputYawPitch?.pitch ?? local.pitch
      const kick = local.sliding ? -0.03 : local.sprinting ? 0.02 : 0
      this.camera.rotation.set(pitch + kick, yaw, 0)

      this.fovKick = damp(this.fovKick, clamp(speed * 0.55, 0, 8) + (local.sliding ? 6 : 0), 6, dt)
      const heldId = local.loadout.slots[local.slot]
      const heldType = heldId ? weaponDef(heldId).type : 'rifle'
      const scoped = local.aiming && heldType === 'sniper'
      const aimFov = heldType === 'sniper' ? 30 : heldType === 'blade' ? 92 : 62
      this.aimBlend = damp(this.aimBlend, local.aiming ? 1 : 0, 14, dt)
      this.camera.fov = 100 + this.fovKick - this.aimBlend * (100 - aimFov)
      this.camera.updateProjectionMatrix()

      this.shake = Math.max(0, this.shake - dt * 1.6)
      if (this.shake > 0.001) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.12
        this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.12
      }

      this.setViewmodel(local.loadout.slots[local.slot])

      // Viewmodel sway + bob, blending toward centre while aiming.
      const vm = this.viewmodelHolder
      vm.position.set(
        0.26 * (1 - this.aimBlend),
        -0.24 + bob * 0.6 + this.aimBlend * 0.06,
        -0.42 + this.aimBlend * 0.1,
      )
      vm.rotation.set(0.02 + Math.sin(this.bobPhase) * 0.01, Math.sin(this.bobPhase * 0.5) * 0.012, 0)
      if (local.sliding) vm.position.y -= 0.04
      if (local.deployed) vm.position.x = 0.02
      if (this.viewmodel) this.viewmodel.visible = local.alive && !scoped

      // Explosion light decay
      if (this.explosionLight.intensity > 0) {
        this.explosionLight.intensity = Math.max(0, this.explosionLight.intensity - dt * 12)
      }

      // Sun follows the player so shadows stay inside the shadow frustum
      this.sun.position.set(local.pos.x + world.map.sun.dir[0] * 65, 75, local.pos.z + world.map.sun.dir[2] * 65)
      this.sun.target.position.set(local.pos.x, 0, local.pos.z)
    }

    // Orbs
    if (this.orbMesh) {
      const active = world.orbs.filter((o) => o.active)
      const matrix = new THREE.Matrix4()
      const bob = Math.sin(world.time * 2.5) * 0.15
      for (let i = 0; i < this.orbMesh.count; i++) {
        if (i < active.length) {
          const o = active[i]
          matrix.makeTranslation(o.pos.x, o.pos.y + bob, o.pos.z)
        } else {
          matrix.makeScale(0, 0, 0)
        }
        this.orbMesh.setMatrixAt(i, matrix)
      }
      this.orbMesh.instanceMatrix.needsUpdate = true
    }

    // Projectiles
    if (this.projectileMesh) {
      const matrix = new THREE.Matrix4()
      for (let i = 0; i < this.projectileMesh.count; i++) {
        if (i < world.projectiles.length) {
          const p = world.projectiles[i]
          matrix.makeTranslation(p.pos.x, p.pos.y, p.pos.z)
        } else {
          matrix.makeScale(0, 0, 0)
        }
        this.projectileMesh.setMatrixAt(i, matrix)
      }
      this.projectileMesh.instanceMatrix.needsUpdate = true
    }

    // Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]
      tr.life -= dt
      if (tr.life <= 0) this.tracers.splice(i, 1)
    }
    for (let i = 0; i < MAX_TRACERS; i++) {
      const tr = this.tracers[i]
      const o = i * 6
      if (tr) {
        const fade = Math.max(0, tr.life / tr.maxLife)
        this.tracerPositions[o + 0] = tr.from.x
        this.tracerPositions[o + 1] = tr.from.y
        this.tracerPositions[o + 2] = tr.from.z
        this.tracerPositions[o + 3] = tr.to.x
        this.tracerPositions[o + 4] = tr.to.y
        this.tracerPositions[o + 5] = tr.to.z
        const c = new THREE.Color(tr.color)
        for (let v = 0; v < 2; v++) {
          this.tracerColors[o + v * 3 + 0] = c.r * fade
          this.tracerColors[o + v * 3 + 1] = c.g * fade
          this.tracerColors[o + v * 3 + 2] = c.b * fade
        }
      } else {
        this.tracerPositions.fill(0, o, o + 6)
        this.tracerColors.fill(0, o, o + 6)
      }
    }
    const geo = this.tracerLines.geometry
    ;(geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true

    // Explosion rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]
      ring.life -= dt
      const t = 1 - Math.max(0, ring.life) / ring.maxLife
      ring.mesh.scale.setScalar(0.4 + t * ring.maxRadius)
      const mat = ring.mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.9 * (1 - t)
      if (ring.life <= 0) {
        this.scene.remove(ring.mesh)
        ring.mesh.geometry.dispose()
        mat.dispose()
        this.rings.splice(i, 1)
      }
    }
  }

  render(): void {
    this.composer.render()
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize)
    this.composer.dispose()
    this.renderer.dispose()
  }
}
