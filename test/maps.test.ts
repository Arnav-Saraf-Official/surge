import { describe, expect, it } from 'vitest'
import { getMap, terrainHeight } from '../src/data/maps'
import { moveAndCollide } from '../src/sim/collision'

describe('map scale and terrain', () => {
  it('expands playable bounds and adds smooth terrain beyond the building area', () => {
    const map = getMap('hollow-ward')

    expect(map.bounds).toBeGreaterThan(110)
    expect(terrainHeight(map, 0, 0)).toBe(0)
    expect(terrainHeight(map, 90, 0)).toBeGreaterThan(0)
    expect(terrainHeight(map, 90.1, 0)).toBeCloseTo(terrainHeight(map, 90, 0), 1)
  })

  it('supports players on the sloped terrain surface', () => {
    const map = getMap('hollow-ward')
    const x = 110
    const y = terrainHeight(map, x, 0)
    const result = moveAndCollide(
      [],
      { x, y: y + 0.1, z: 0 },
      { x: 0, y: -10, z: 0 },
      0.1,
      1.8,
      0,
      (px, pz) => terrainHeight(map, px, pz),
    )

    expect(result.onGround).toBe(true)
    expect(result.pos.y).toBeCloseTo(y)
  })
})
