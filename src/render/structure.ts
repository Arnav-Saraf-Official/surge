import * as THREE from 'three'
import type { BoxDef, MapDef } from '../data/types'
import { getPlankTexture, getStoneTexture } from './kitTextures'
import { instanced, makeRng, reliefMaterial, type Placement } from './kit'

/**
 * Structure detailing pass.
 *
 * Collision geometry stays the plain AABBs in `data/maps.ts`. This layer adds
 * the construction details those solid boxes are missing: plinths and cornices
 * on facades, pilasters and downpipes on long boundary walls, roof flashing and
 * vents, framed crates, container corner posts, stair nosings, car wheels and
 * running lights, and lattice bracing on watch-tower legs.
 *
 * Like the natural kit, everything is packed into a handful of InstancedMeshes.
 */
export function buildStructures(map: MapDef): THREE.Group {
  const group = new THREE.Group()
  group.name = `structures:${map.id}`
  const rng = makeRng(0x9e37 + map.id.length * 104729)

  const stone = reliefMaterial(getStoneTexture(), 0.9, 0.02, 0.7)
  const plank = reliefMaterial(getPlankTexture(), 0.85, 0.02, 0.5)
  plank.color.setHex(0x8b6a49)
  const metal = new THREE.MeshStandardMaterial({ color: 0x66707c, roughness: 0.5, metalness: 0.65 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.38, metalness: 0.8 })
  const safety = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.55, metalness: 0.3 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.95 })
  const headlight = new THREE.MeshStandardMaterial({
    color: 0xfff0c4,
    emissive: 0xffc46b,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  })
  const taillight = new THREE.MeshStandardMaterial({
    color: 0xff6a4a,
    emissive: 0xff2a12,
    emissiveIntensity: 1.4,
    roughness: 0.35,
  })

  const stoneTrim: Placement[] = []
  const metalTrim: Placement[] = []
  const frames: Placement[] = []
  const braces: Placement[] = []
  const nosings: Placement[] = []
  const wheels: Placement[] = []
  const headlights: Placement[] = []
  const taillights: Placement[] = []
  const pipes: Placement[] = []

  for (const box of map.boxes) {
    if (box.kind !== 'wall') continue
    // Natural rock is left alone; only built walls get architectural trim.
    if (box.texture === 'cliff') continue
    const [x, y, z] = box.pos
    const [w, h, d] = box.size
    if (h < 2.4) continue
    const alongX = w >= d
    const length = alongX ? w : d
    const thick = alongX ? d : w
    if (length < 1.6) continue

    const bottom = y - h / 2
    const top = y + h / 2
    const face = thick / 2 + 0.06
    const metalWall = box.texture === 'corrugated' || box.texture === 'metal'
    const trim = metalWall ? metalTrim : stoneTrim

    // Coping across the wall head, then a plinth and eaves band on both faces.
    trim.push({
      p: [x, top - 0.05, z],
      s: alongX ? [length + 0.16, 0.14, thick + 0.3] : [thick + 0.3, 0.14, length + 0.16],
    })
    for (const side of [-1, 1]) {
      const offX = alongX ? 0 : side * face
      const offZ = alongX ? side * face : 0
      trim.push({
        p: [x + offX, bottom + 0.22, z + offZ],
        s: alongX ? [length, 0.44, 0.14] : [0.14, 0.44, length],
      })
      trim.push({
        p: [x + offX, top - 0.24, z + offZ],
        s: alongX ? [length, 0.32, 0.18] : [0.18, 0.32, length],
      })
    }

    // Long perimeter walls read as endless slabs without vertical rhythm.
    if (length >= 20) {
      const count = Math.max(2, Math.floor(length / 9))
      for (let i = 1; i < count; i++) {
        const along = -length / 2 + (length * i) / count
        trim.push({
          p: alongX ? [x + along, bottom + h / 2, z] : [x, bottom + h / 2, z + along],
          s: alongX ? [0.5, h * 0.96, thick + 0.26] : [thick + 0.26, h * 0.96, 0.5],
        })
      }
    }

    if (!metalWall && length >= 18) {
      const count = Math.max(1, Math.floor(length / 24))
      for (let i = 0; i < count; i++) {
        const along = -length / 2 + (length * (i + 0.5)) / count
        pipes.push({
          p: alongX ? [x + along, bottom + h / 2, z + face + 0.1] : [x + face + 0.1, bottom + h / 2, z + along],
          s: [0.12, h, 0.12],
        })
      }
    }
  }

  for (const box of map.boxes) {
    if (box.kind !== 'roof') continue
    const [x, y, z] = box.pos
    const [w, h, d] = box.size
    const top = y + h / 2
    const inset = 0.16
    // Low edge flashing instead of a collidable parapet.
    metalTrim.push(
      { p: [x, top + 0.06, z - d / 2 + inset], s: [w, 0.12, 0.22] },
      { p: [x, top + 0.06, z + d / 2 - inset], s: [w, 0.12, 0.22] },
      { p: [x - w / 2 + inset, top + 0.06, z], s: [0.22, 0.12, d] },
      { p: [x + w / 2 - inset, top + 0.06, z], s: [0.22, 0.12, d] },
    )
    // A single rooftop vent on the big slabs, clear of the perimeter.
    if (w * d > 70 && rng() > 0.35) {
      const vx = x + (rng() - 0.5) * Math.max(0, w - 5)
      const vz = z + (rng() - 0.5) * Math.max(0, d - 5)
      metalTrim.push(
        { p: [vx, top + 0.55, vz], s: [1.4, 1.0, 1.4] },
        { p: [vx, top + 1.12, vz], s: [1.7, 0.12, 1.7] },
      )
    }
  }

  for (const box of map.boxes) {
    if (box.kind !== 'steps') continue
    const [x, y, z] = box.pos
    const [w, h, d] = box.size
    const top = y + h / 2 + 0.03
    // Tread nosing on both exposed edges.
    nosings.push(
      { p: [x, top, z - d / 2 + 0.06], s: [w * 0.98, 0.06, 0.12] },
      { p: [x, top, z + d / 2 - 0.06], s: [w * 0.98, 0.06, 0.12] },
    )
  }

  for (const box of map.boxes) {
    if (box.kind !== 'cover') continue
    const [x, y, z] = box.pos
    const [w, h, d] = box.size

    if (box.texture === 'woodCrate' && h <= 3) {
      // Corner battens plus a diagonal brace on the large faces.
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          frames.push({
            p: [x + sx * (w / 2 - 0.05), y, z + sz * (d / 2 - 0.05)],
            s: [0.11, h + 0.02, 0.11],
          })
        }
      }
      const alongX = w >= d
      const span = (alongX ? w : d) * 0.86
      const rise = h * 0.82
      const length = Math.hypot(span, rise)
      const angle = Math.atan2(rise, span)
      const face = alongX ? d / 2 : w / 2
      for (const side of [-1, 1]) {
        braces.push(
          alongX
            ? { p: [x, y, z + side * face], s: [length, 0.09, 0.09], rz: angle }
            : { p: [x + side * face, y, z], s: [0.09, length, 0.09], rx: angle },
        )
      }
    }

    // Concrete parapets and barricades get a proper coping.
    if (box.texture === 'concrete' && Math.min(w, d) <= 0.9 && h <= 1.6) {
      stoneTrim.push({ p: [x, y + h / 2 + 0.02, z], s: [w + 0.08, 0.1, d + 0.08] })
    }

    // Shipping containers / silos: corner castings and edge rails.
    if (box.texture === 'corrugated' && h <= 3.5 && Math.min(w, d) >= 2.2) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          braces.push({
            p: [x + sx * (w / 2 - 0.06), y, z + sz * (d / 2 - 0.06)],
            s: [0.16, h, 0.16],
          })
        }
      }
      braces.push(
        { p: [x, y + h / 2 - 0.08, z - d / 2 + 0.06], s: [w, 0.14, 0.16] },
        { p: [x, y + h / 2 - 0.08, z + d / 2 - 0.06], s: [w, 0.14, 0.16] },
      )
    }
  }

  for (const box of map.boxes) {
    if (box.kind !== 'car' || box.texture !== 'metal' || box.size[1] > 0.8) continue
    const [x, y, z] = box.pos
    const [w, h, d] = box.size
    const bottom = y - h / 2
    const alongX = w > d
    const length = alongX ? w : d
    const width = alongX ? d : w
    const wheelY = bottom + 0.36
    for (const along of [-1, 1]) {
      for (const side of [-1, 1]) {
        wheels.push({
          p: alongX
            ? [x + along * length * 0.32, wheelY, z + side * (width / 2)]
            : [x + side * (width / 2), wheelY, z + along * length * 0.32],
          s: [0.36, 0.26, 0.36],
          rx: alongX ? Math.PI / 2 : 0,
          rz: alongX ? 0 : Math.PI / 2,
        })
      }
    }

    // Lamp clusters at both ends; one warm, one red.
    for (const side of [-1, 1]) {
      for (const across of [-1, 1]) {
        const lamp: Placement = {
          p: alongX
            ? [x + side * (length / 2 + 0.02), bottom + 0.55, z + across * width * 0.28]
            : [x + across * width * 0.28, bottom + 0.55, z + side * (length / 2 + 0.02)],
          s: alongX ? [0.06, 0.16, 0.22] : [0.22, 0.16, 0.06],
        }
        if (side > 0) headlights.push(lamp)
        else taillights.push(lamp)
      }
    }
    metalTrim.push(
      alongX
        ? { p: [x, bottom + 0.28, z], s: [length * 1.01, 0.16, width * 0.9] }
        : { p: [x, bottom + 0.28, z], s: [width * 0.9, 0.16, length * 1.01] },
    )
  }

  // Watch towers: collar beams and crossed lattice bracing between the legs.
  const legs = map.boxes.filter((b) => b.kind === 'tower')
  const claimed = new Set<BoxDef>()
  for (const leg of legs) {
    if (claimed.has(leg)) continue
    const cluster = legs.filter(
      (other) => !claimed.has(other) && Math.hypot(other.pos[0] - leg.pos[0], other.pos[2] - leg.pos[2]) < 12,
    )
    for (const member of cluster) claimed.add(member)
    if (cluster.length < 3) continue

    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const member of cluster) {
      minX = Math.min(minX, member.pos[0] - member.size[0] / 2)
      maxX = Math.max(maxX, member.pos[0] + member.size[0] / 2)
      minZ = Math.min(minZ, member.pos[2] - member.size[2] / 2)
      maxZ = Math.max(maxZ, member.pos[2] + member.size[2] / 2)
      minY = Math.min(minY, member.pos[1] - member.size[1] / 2)
      maxY = Math.max(maxY, member.pos[1] + member.size[1] / 2)
    }
    const centerX = (minX + maxX) / 2
    const centerZ = (minZ + maxZ) / 2
    const spanX = maxX - minX
    const spanZ = maxZ - minZ

    const levels = [0.22, 0.47, 0.72, 0.94].map((t) => minY + (maxY - minY) * t)
    for (const levelY of levels) {
      braces.push(
        { p: [centerX, levelY, minZ], s: [spanX, 0.16, 0.16] },
        { p: [centerX, levelY, maxZ], s: [spanX, 0.16, 0.16] },
        { p: [minX, levelY, centerZ], s: [0.16, 0.16, spanZ] },
        { p: [maxX, levelY, centerZ], s: [0.16, 0.16, spanZ] },
      )
    }
    for (let i = 0; i < levels.length - 1; i++) {
      const low = levels[i]
      const high = levels[i + 1]
      const dy = high - low
      const midY = (low + high) / 2
      const angleX = Math.atan2(dy, spanX)
      const angleZ = Math.atan2(dy, spanZ)
      const lengthX = Math.hypot(spanX, dy)
      const lengthZ = Math.hypot(spanZ, dy)
      for (const side of [-1, 1]) {
        braces.push(
          { p: [centerX, midY, minZ], s: [lengthX, 0.12, 0.12], rz: side * angleX },
          { p: [centerX, midY, maxZ], s: [lengthX, 0.12, 0.12], rz: side * angleX },
          { p: [minX, midY, centerZ], s: [0.12, lengthZ, 0.12], rx: side * angleZ },
          { p: [maxX, midY, centerZ], s: [0.12, lengthZ, 0.12], rx: side * angleZ },
        )
      }
    }
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1)
  const wheelGeometry = new THREE.CylinderGeometry(1, 1, 1, 14)
  const pipeGeometry = new THREE.CylinderGeometry(1, 1, 1, 7)
  const parts: Array<THREE.InstancedMesh | null> = [
    instanced(unitBox, stone, stoneTrim),
    instanced(unitBox, metal, metalTrim),
    instanced(unitBox, plank, frames),
    instanced(unitBox, steel, braces),
    instanced(unitBox, safety, nosings),
    instanced(wheelGeometry, rubber, wheels),
    instanced(unitBox, headlight, headlights, false),
    instanced(unitBox, taillight, taillights, false),
    instanced(pipeGeometry, steel, pipes),
  ]
  for (const part of parts) if (part) group.add(part)

  return group
}
