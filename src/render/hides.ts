import * as THREE from 'three'
import type { MapDef } from '../data/types'
import { getJungleFoliageTexture, getTreeBarkTexture, getWoodCrateTexture } from './textures'

/**
 * Concealment prefabs. These are deliberately *not* colliders: the sim owns the
 * hide volumes, and leaving them out of collision means a shot that reaches the
 * spot still hits the player inside it, exactly like the design asks for.
 *
 * The leaf shells are open rings so the camera is never sealed inside a solid
 * ball; from the middle you look straight out between the leaves.
 */
export function buildHides(map: MapDef): THREE.Group {
  const group = new THREE.Group()
  const hides = map.hides ?? []
  if (!hides.length) return group

  const foliage = getJungleFoliageTexture()
  const leafLight = new THREE.MeshStandardMaterial({
    map: foliage,
    color: 0x516b41,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  })
  const leafDark = new THREE.MeshStandardMaterial({
    map: foliage,
    color: 0x33452c,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  })
  const bark = new THREE.MeshStandardMaterial({
    map: getTreeBarkTexture(),
    color: 0x5b4a38,
    roughness: 0.95,
    metalness: 0,
  })
  const crate = new THREE.MeshStandardMaterial({
    map: getWoodCrateTexture(),
    color: 0x8a7355,
    roughness: 0.85,
    metalness: 0.05,
  })
  const crateDark = new THREE.MeshStandardMaterial({
    map: getWoodCrateTexture(),
    color: 0x5d4c39,
    roughness: 0.9,
    metalness: 0.05,
  })

  for (const hide of hides) {
    const [x, y, z] = hide.pos
    const radius = Math.max(1.1, hide.radius * 0.42)
    const lean = hide.pos[0] * 0.37 + hide.pos[2] * 0.11

    if (hide.cover === 'crates') {
      // A stacked nook with a clear gap at eye height so you can watch outside.
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + lean
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(radius * 0.85, radius * 0.85, radius * 0.85),
          i % 2 === 0 ? crate : crateDark,
        )
        box.position.set(
          x + Math.cos(angle) * radius * 1.55,
          y + 0.42 + (i % 2) * 0.55,
          z + Math.sin(angle) * radius * 1.55,
        )
        box.rotation.y = angle
        box.castShadow = true
        box.receiveShadow = true
        group.add(box)
      }
      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 1.7, radius * 0.6, radius * 1.7),
        crateDark,
      )
      lid.position.set(x, y + 2.55, z)
      lid.rotation.y = lean
      lid.castShadow = true
      group.add(lid)
      continue
    }

    // Leaf clump: a belt of bushes below and a crown above, open at eye level.
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + lean
      const leaf = new THREE.Mesh(
        new THREE.IcosahedronGeometry(radius * 0.95, 0),
        i % 2 === 0 ? leafLight : leafDark,
      )
      leaf.position.set(
        x + Math.cos(angle) * radius * 1.35,
        y + 0.5 + (i % 3) * 0.16,
        z + Math.sin(angle) * radius * 1.35,
      )
      leaf.rotation.set(i * 0.8, i * 1.3, i * 0.5)
      leaf.castShadow = true
      leaf.receiveShadow = true
      group.add(leaf)
    }
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - lean
      const leaf = new THREE.Mesh(
        new THREE.IcosahedronGeometry(radius * 1.1, 0),
        i % 2 === 0 ? leafLight : leafDark,
      )
      leaf.position.set(
        x + Math.cos(angle) * radius * 0.7,
        y + 2.15 + (i % 2) * 0.3,
        z + Math.sin(angle) * radius * 0.7,
      )
      leaf.rotation.set(i * 0.6, i * 0.9, i * 0.3)
      leaf.castShadow = true
      group.add(leaf)
    }
    // A few upright stems so it reads as a tree's leaves rather than a hedge.
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.4
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.07, 2.15, 5),
        bark,
      )
      stem.position.set(
        x + Math.cos(angle) * radius * 1.1,
        y + 1.1,
        z + Math.sin(angle) * radius * 1.1,
      )
      stem.rotation.z = Math.cos(angle) * 0.08
      stem.castShadow = true
      group.add(stem)
    }
  }

  return group
}
