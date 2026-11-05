import * as THREE from 'three'
import type { BoxDef, MapDef } from '../data/types'
import { terrainHeight } from '../data/maps'
import {
  getBarkTexture,
  getCanopyTexture,
  getPlankTexture,
  getRockTexture,
  getStoneTexture,
  getSurfaceNormal,
} from './kitTextures'

/**
 * Prefab kit.
 *
 * Collision stays the existing AABB layout in `data/maps.ts`; this module only
 * replaces the flat cuboid *visuals* for organic and hand-built pieces with
 * constructed geometry: faceted canopy clusters, tapered trunks with roots,
 * chunky stone courses, plank walkways, ruin columns and ground scatter.
 *
 * Every piece is emitted through a handful of InstancedMeshes so the extra
 * detail costs draw calls in the low twenties rather than one per block.
 */

type Vec3Tuple = [number, number, number]

export interface Placement {
  p: Vec3Tuple
  s: Vec3Tuple
  rx?: number
  ry?: number
  rz?: number
  c?: number
}

const dummy = new THREE.Object3D()
const scratchColor = new THREE.Color()

export function makeRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function reliefMaterial(map: THREE.Texture, roughness: number, metalness = 0, relief = 0.7): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map, roughness, metalness })
  material.normalMap = getSurfaceNormal(map, relief)
  material.normalScale.set(1, 1)
  return material
}

export function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: Placement[],
  castShadow = true,
): THREE.InstancedMesh | null {
  if (placements.length === 0) return null
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length)
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  placements.forEach((p, i) => {
    dummy.position.set(p.p[0], p.p[1], p.p[2])
    dummy.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)
    dummy.scale.set(p.s[0], p.s[1], p.s[2])
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    if (p.c !== undefined) mesh.setColorAt(i, scratchColor.setHex(p.c))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = castShadow
  mesh.receiveShadow = true
  return mesh
}

/** Boxes whose visuals are fully replaced by kit geometry. */
export function isKitBox(box: BoxDef): boolean {
  if (box.kind === 'maze' || box.kind === 'monolith' || box.kind === 'catwalk' || box.kind === 'treePlatform') {
    return true
  }
  if (box.kind === 'bush') return true
  // `roost` covers antennas and hazard rings too; only ruin pillars are rebuilt.
  return box.kind === 'roost' && box.texture === 'concrete'
}

/** Three crossed blades, cheap enough to scatter by the thousand. */
function tuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI
    const bx = Math.cos(angle) * 0.2
    const bz = Math.sin(angle) * 0.2
    const tipX = bx * 0.3 + Math.cos(angle + 1.3) * 0.16
    const tipZ = bz * 0.3 + Math.sin(angle + 1.3) * 0.16
    positions.push(bx, 0, bz, -bx, 0, -bz, tipX, 0.85 - i * 0.12, tipZ)
    for (let k = 0; k < 3; k++) normals.push(0, 1, 0)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return geometry
}

function pointInsideBoxes(boxes: BoxDef[], x: number, y: number, z: number, pad = 0): boolean {
  for (const b of boxes) {
    // Ground slabs are where the player stands, not obstacles.
    if (b.kind === 'floor') continue
    if (
      x > b.pos[0] - b.size[0] / 2 - pad &&
      x < b.pos[0] + b.size[0] / 2 + pad &&
      z > b.pos[2] - b.size[2] / 2 - pad &&
      z < b.pos[2] + b.size[2] / 2 + pad &&
      y > b.pos[1] - b.size[1] / 2 - 0.4 &&
      y < b.pos[1] + b.size[1] / 2 + 0.4
    ) {
      return true
    }
  }
  return false
}

export function buildKit(map: MapDef): THREE.Group {
  const group = new THREE.Group()
  const groupName = `kit:${map.id}`
  group.name = groupName
  const travel = makeRng(0x51f0 + map.id.length * 7919)

  const trunks = map.boxes.filter((b) => b.kind === 'trunk')
  const foliage = map.boxes.filter((b) => b.kind === 'foliage')
  const maze = map.boxes.filter((b) => b.kind === 'maze')
  const rocks = map.boxes.filter((b) => b.kind === 'monolith')
  const decks = map.boxes.filter((b) => b.kind === 'catwalk' || b.kind === 'treePlatform')
  const pillars = map.boxes.filter((b) => b.kind === 'roost' && b.texture === 'concrete')

  const bark = reliefMaterial(getBarkTexture(), 0.95, 0, 0.9)
  const canopy = new THREE.MeshStandardMaterial({
    map: getCanopyTexture(),
    roughness: 0.82,
    metalness: 0,
    flatShading: true,
  })
  canopy.normalMap = getSurfaceNormal(getCanopyTexture(), 0.45)
  const stone = reliefMaterial(getStoneTexture(), 0.92, 0.02, 0.85)
  const rock = reliefMaterial(getRockTexture(), 0.95, 0.02, 0.8)
  const plank = reliefMaterial(getPlankTexture(), 0.85, 0.02, 0.6)
  const rope = new THREE.MeshStandardMaterial({ color: 0x3c3a26, roughness: 0.95 })
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x7fa653,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide,
  })
  const glow = new THREE.MeshStandardMaterial({
    color: 0x9dffe0,
    emissive: 0x35ffc4,
    emissiveIntensity: 2.4,
    roughness: 0.4,
  })

  // ---------------------------------------------------------------- trees --
  const trunkParts: Placement[] = []
  const roots: Placement[] = []
  const branches: Placement[] = []
  const vines: Placement[] = []
  const blobs: Placement[] = []
  const glows: Placement[] = []
  const canopyTones = [0xcfe8b8, 0xb9dea2, 0xa8d493, 0xdcf0c6, 0x9ccb8a]

  for (const trunk of trunks) {
    const height = trunk.size[1]
    const radius = Math.max(0.35, Math.min(trunk.size[0], trunk.size[2]) / 2)
    const baseY = trunk.pos[1] - height / 2

    trunkParts.push({
      p: [trunk.pos[0], trunk.pos[1], trunk.pos[2]],
      s: [radius, height, radius],
      ry: travel() * Math.PI,
    })

    // Buttress roots fanning out around the base.
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + travel() * 0.4
      roots.push({
        p: [
          trunk.pos[0] + Math.cos(angle) * radius * 1.05,
          baseY + 0.5,
          trunk.pos[2] + Math.sin(angle) * radius * 1.05,
        ],
        s: [radius * 0.34, 1.6 + travel() * 0.7, radius * 0.34],
        rx: Math.sin(angle) * 0.8,
        rz: -Math.cos(angle) * 0.8,
      })
    }

    // Two or three limbs reaching into the canopy.
    const limbCount = 2 + Math.floor(travel() * 3)
    for (let i = 0; i < limbCount; i++) {
      const angle = travel() * Math.PI * 2
      const tilt = 1.02 + travel() * 0.28
      const length = radius * 3 + travel() * 4
      const attachY = baseY + height * (0.5 + travel() * 0.32)
      const dirX = Math.sin(tilt) * Math.cos(angle)
      const dirY = Math.cos(tilt)
      const dirZ = Math.sin(tilt) * Math.sin(angle)
      branches.push({
        p: [
          trunk.pos[0] + dirX * (length / 2 + radius * 0.5),
          attachY + dirY * (length / 2),
          trunk.pos[2] + dirZ * (length / 2 + radius * 0.5),
        ],
        s: [radius * 0.17, length, radius * 0.17],
        rx: Math.sin(angle) * tilt,
        rz: -Math.cos(angle) * tilt,
      })
    }

    // Hanging vines make the jungle read as layered rather than clean.
    const vineCount = map.id === 'skyfoundry' ? 2 + Math.floor(travel() * 3) : 0
    for (let i = 0; i < vineCount; i++) {
      const angle = travel() * Math.PI * 2
      const length = 5 + travel() * 8
      vines.push({
        p: [
          trunk.pos[0] + Math.cos(angle) * radius * (1.5 + travel() * 1.4),
          baseY + height * (0.72 + travel() * 0.18) - length / 2,
          trunk.pos[2] + Math.sin(angle) * radius * (1.5 + travel() * 1.4),
        ],
        s: [0.07, length, 0.07],
        c: travel() > 0.5 ? 0x3f5a2c : 0x2f4726,
      })
    }

    // A small crown guarantees no trunk reads as bare.
    const crownRadius = Math.max(1.4, radius * 2.6)
    for (let i = 0; i < 3; i++) {
      blobs.push({
        p: [
          trunk.pos[0] + (travel() - 0.5) * crownRadius * 1.6,
          baseY + height + crownRadius * 0.2 + (travel() - 0.5) * crownRadius * 0.5,
          trunk.pos[2] + (travel() - 0.5) * crownRadius * 1.6,
        ],
        s: [crownRadius, crownRadius * 0.7, crownRadius],
        ry: travel() * Math.PI,
        c: canopyTones[Math.floor(travel() * canopyTones.length)],
      })
    }

    // Bioluminescent fungus at the base of jungle trees.
    if (map.id === 'skyfoundry' && travel() > 0.35) {
      for (let i = 0; i < 2 + Math.floor(travel() * 3); i++) {
        const angle = travel() * Math.PI * 2
        const dist = radius * (1.2 + travel() * 1.6)
        glows.push({
          p: [trunk.pos[0] + Math.cos(angle) * dist, baseY + 0.16, trunk.pos[2] + Math.sin(angle) * dist],
          s: [0.09 + travel() * 0.06, 0.14 + travel() * 0.1, 0.09 + travel() * 0.06],
        })
      }
    }
  }

  for (const leaf of foliage) {
    const halfX = leaf.size[0] / 2
    const halfZ = leaf.size[2] / 2
    const base = Math.min(halfX, halfZ)
    const count = Math.max(4, Math.min(8, Math.round((leaf.size[0] * leaf.size[2]) / 18)))
    const canopyTop = leaf.pos[1] + leaf.size[1] / 2
    // Flat canopy volumes sit over tree platforms and bridges, so the leaves are
    // lifted above the deck; tall crown volumes still wrap the trunk top.
    const shelf = leaf.size[1] <= 3.2
    for (let i = 0; i < count; i++) {
      const angle = travel() * Math.PI * 2
      const spread = Math.sqrt(travel()) * 0.62
      const radius = base * (0.26 + travel() * 0.2)
      const thickness = radius * (0.55 + travel() * 0.3)
      blobs.push({
        p: [
          leaf.pos[0] + Math.cos(angle) * spread * halfX,
          shelf
            ? canopyTop + thickness * 0.95 + travel() * thickness * 0.25
            : leaf.pos[1] + (travel() - 0.5) * leaf.size[1] * 0.55,
          leaf.pos[2] + Math.sin(angle) * spread * halfZ,
        ],
        s: [radius, thickness, radius * (0.85 + travel() * 0.3)],
        ry: travel() * Math.PI,
        c: canopyTones[Math.floor(travel() * canopyTones.length)],
      })
    }
  }

  // -------------------------------------------------------------- boulders --
  const boulders: Placement[] = []
  for (const rockBox of rocks) {
    const half = Math.min(rockBox.size[0], rockBox.size[2]) / 2
    // Monoliths are tall pillars: stack rock chunks up the full collider height
    // so the visible stone still fills the AABB the player collides with.
    const count = Math.max(3, Math.round(rockBox.size[1] / 1.15))
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count
      const radius = half * (0.95 - t * 0.3) * (0.9 + travel() * 0.2)
      boulders.push({
        p: [
          rockBox.pos[0] + (travel() - 0.5) * half * 0.5,
          rockBox.pos[1] - rockBox.size[1] / 2 + t * rockBox.size[1],
          rockBox.pos[2] + (travel() - 0.5) * half * 0.5,
        ],
        s: [radius, radius * (0.9 + travel() * 0.4), radius * (0.85 + travel() * 0.3)],
        rx: travel() * 0.4,
        ry: travel() * Math.PI,
        rz: travel() * 0.3,
        c: travel() > 0.72 ? 0x93a784 : 0xbfc7b8,
      })
    }
  }

  // ---------------------------------------------------------- ruin masonry --
  const stones: Placement[] = []
  const stoneTones = [0xc3cab6, 0xb3baa6, 0xd2d8c4, 0xa5ac9a]
  for (const wall of maze) {
    const alongX = wall.size[0] >= wall.size[2]
    const long = alongX ? wall.size[0] : wall.size[2]
    const thick = alongX ? wall.size[2] : wall.size[0]
    const courses = Math.max(2, Math.min(5, Math.round(wall.size[1] / 1.15)))
    const courseH = wall.size[1] / courses
    const blocks = Math.max(1, Math.round(long / 2.1))
    const blockLen = long / blocks
    for (let c = 0; c < courses; c++) {
      for (let i = 0; i < blocks; i++) {
        const offset = -long / 2 + blockLen * (i + 0.5)
        const jitter = (travel() - 0.5) * 0.09
        const y = wall.pos[1] - wall.size[1] / 2 + courseH * (c + 0.5)
        const width = (alongX ? blockLen : thick) * (1.025 + jitter)
        const depth = (alongX ? thick : blockLen) * (1.025 + jitter)
        stones.push({
          p: [wall.pos[0] + (alongX ? offset : 0), y, wall.pos[2] + (alongX ? 0 : offset)],
          s: [width, courseH * 1.02, depth],
          ry: (travel() - 0.5) * 0.035,
          c: stoneTones[Math.floor(travel() * stoneTones.length)],
        })
      }
    }
  }

  // ------------------------------------------------------------- walkways --
  const boards: Placement[] = []
  const posts: Placement[] = []
  const rails: Placement[] = []
  for (const deck of decks) {
    const alongX = deck.size[0] >= deck.size[2]
    const long = alongX ? deck.size[0] : deck.size[2]
    const wide = alongX ? deck.size[2] : deck.size[0]
    const top = deck.pos[1] + deck.size[1] / 2
    const planks = Math.max(3, Math.round(wide / 0.5))
    for (let i = 0; i < planks; i++) {
      const across = -wide / 2 + (wide * (i + 0.5)) / planks
      const boardWide = (wide / planks) * 0.9
      boards.push({
        p: alongX ? [deck.pos[0], top - 0.05, deck.pos[2] + across] : [deck.pos[0] + across, top - 0.05, deck.pos[2]],
        s: alongX ? [long, 0.1, boardWide] : [boardWide, 0.1, long],
      })
    }

    // Suspension bridges get rails; tree perches stay open so players can drop
    // off any edge without clipping through a railing.
    if (deck.kind !== 'catwalk') continue
    const step = 3.6
    const segments = Math.max(1, Math.round(long / step))
    for (const side of [-1, 1]) {
      const across = side * (wide / 2 - 0.12)
      rails.push({
        p: alongX ? [deck.pos[0], top + 1.0, deck.pos[2] + across] : [deck.pos[0] + across, top + 1.0, deck.pos[2]],
        s: alongX ? [long, 0.09, 0.09] : [0.09, 0.09, long],
      })
      for (let i = 0; i <= segments; i++) {
        const along = -long / 2 + (long * i) / segments
        posts.push({
          p: alongX ? [deck.pos[0] + along, top + 0.5, deck.pos[2] + across] : [deck.pos[0] + across, top + 0.5, deck.pos[2] + along],
          s: [0.11, 1.0, 0.11],
        })
      }
    }
  }

  // -------------------------------------------------------------- columns --
  const shaftGeometry = new THREE.CylinderGeometry(0.46, 0.54, 1, 9)
  const stoneShaft = reliefMaterial(getStoneTexture(), 0.9, 0.02, 0.8)
  const capitals: Placement[] = []
  for (const pillar of pillars) {
    const radius = Math.min(pillar.size[0], pillar.size[2]) / 2
    const shaft = new THREE.Mesh(shaftGeometry, stoneShaft)
    shaft.position.set(pillar.pos[0], pillar.pos[1], pillar.pos[2])
    shaft.scale.set(radius * 2, pillar.size[1], radius * 2)
    shaft.castShadow = true
    shaft.receiveShadow = true
    group.add(shaft)
    capitals.push(
      { p: [pillar.pos[0], pillar.pos[1] - pillar.size[1] / 2 + 0.3, pillar.pos[2]], s: [radius * 2.5, 0.6, radius * 2.5] },
      { p: [pillar.pos[0], pillar.pos[1] + pillar.size[1] / 2 - 0.25, pillar.pos[2]], s: [radius * 2.4, 0.5, radius * 2.4] },
    )
  }

  // -------------------------------------------------------- ground scatter --
  const grass: Placement[] = []
  if (map.id === 'skyfoundry') {
    const extent = (map.bounds ?? 100) * 0.93
    let guard = 0
    while (grass.length < 1300 && guard < 9000) {
      guard++
      const x = (travel() * 2 - 1) * extent
      const z = (travel() * 2 - 1) * extent
      const y = terrainHeight(map, x, z)
      if (pointInsideBoxes(map.boxes, x, y + 0.3, z)) continue
      const scale = 0.7 + travel() * 1.1
      grass.push({
        p: [x, y, z],
        s: [scale, scale, scale],
        ry: travel() * Math.PI,
        c: travel() > 0.6 ? 0x5d7d3c : travel() > 0.3 ? 0x4a6a32 : 0x3b5729,
      })
    }
  }

  const bushBlobs: Placement[] = []
  for (const box of map.boxes) {
    if (box.kind !== 'bush') continue
    const radius = Math.max(0.8, Math.min(box.size[0], box.size[2]) * 0.4)
    for (let i = 0; i < 3; i++) {
      bushBlobs.push({
        p: [
          box.pos[0] + (travel() - 0.5) * box.size[0] * 0.5,
          box.pos[1] + (travel() - 0.5) * box.size[1] * 0.35,
          box.pos[2] + (travel() - 0.5) * box.size[2] * 0.5,
        ],
        s: [radius * (0.7 + travel() * 0.4), radius * (0.55 + travel() * 0.3), radius * (0.7 + travel() * 0.4)],
        ry: travel() * Math.PI,
        c: canopyTones[Math.floor(travel() * canopyTones.length)],
      })
    }
  }

  const parts: Array<THREE.InstancedMesh | null> = [
    instanced(new THREE.CylinderGeometry(0.62, 1, 1, 9), bark, trunkParts),
    instanced(new THREE.CylinderGeometry(0.25, 1, 1, 6), bark, roots),
    instanced(new THREE.CylinderGeometry(0.7, 1, 1, 6), bark, branches),
    instanced(new THREE.CylinderGeometry(1, 1, 1, 5), rope, vines, false),
    instanced(new THREE.IcosahedronGeometry(1, 1), canopy, blobs),
    instanced(new THREE.IcosahedronGeometry(1, 1), rock, boulders),
    instanced(new THREE.BoxGeometry(1, 1, 1), stone, stones),
    instanced(new THREE.BoxGeometry(1, 1, 1), plank, boards),
    instanced(new THREE.BoxGeometry(1, 1, 1), rope, posts),
    instanced(new THREE.BoxGeometry(1, 1, 1), rope, rails),
    instanced(new THREE.BoxGeometry(1, 1, 1), stone, capitals),
    instanced(tuftGeometry(), grassMaterial, grass, false),
    instanced(new THREE.IcosahedronGeometry(1, 1), glow, glows, false),
    instanced(new THREE.IcosahedronGeometry(1, 1), canopy, bushBlobs),
  ]
  for (const part of parts) if (part) group.add(part)

  return group
}
