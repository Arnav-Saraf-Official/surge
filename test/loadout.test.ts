import { describe, expect, it } from 'vitest'
import { emptyUpgrades } from '../src/data/upgrades'
import { deriveStats, emptyLoadout } from '../src/sim/player'

function withWeapons(ids: string[]) {
  const loadout = emptyLoadout()
  ids.forEach((id, i) => {
    loadout.slots[i * 2] = id
  })
  return loadout
}

describe('loadout rules', () => {
  it('gives the full Specialist package for a single weapon', () => {
    const stats = deriveStats(withWeapons(['reaper']), emptyUpgrades())
    expect(stats.specialist).toBe(true)
    expect(stats.maxHealth).toBe(120)
    expect(stats.speedMult).toBeCloseTo(1.1, 5)
    expect(stats.cdr).toBeCloseTo(0.15, 5)
    expect(stats.damageMult).toBeCloseTo(1.1, 5)
  })

  it('gives half the package to two weapons', () => {
    const stats = deriveStats(withWeapons(['reaper', 'katana']), emptyUpgrades())
    expect(stats.duelist).toBe(true)
    expect(stats.maxHealth).toBe(110)
    expect(stats.speedMult).toBeCloseTo(1.05, 5)
    expect(stats.cdr).toBeCloseTo(0.075, 5)
    expect(stats.damageMult).toBeCloseTo(1.05, 5)
  })

  it('rotates empty slot buffs with a cap of two stacks each', () => {
    // Three weapons means four empty slots: health, speed, reload, cooldown.
    const stats = deriveStats(withWeapons(['reaper', 'katana', 'gilded']), emptyUpgrades())
    expect(stats.emptySlots).toBe(4)
    expect(stats.maxHealth).toBe(105)
    expect(stats.speedMult).toBeCloseTo(1.05, 5)
    expect(stats.reloadMult).toBeCloseTo(1.05, 5)
    expect(stats.cdr).toBeCloseTo(0.05, 5)

    // Five weapons means two empty slots, so no buff ever exceeds one stack.
    const few = deriveStats(withWeapons(['reaper', 'katana', 'gilded', 'breacher', 'ghostline']), emptyUpgrades())
    expect(few.emptySlots).toBe(2)
    expect(few.maxHealth).toBe(105)
  })

  it('applies upgrade points additively', () => {
    const up = { ...emptyUpgrades(), vitality: 3, agility: 2, focus: 3 }
    const stats = deriveStats(withWeapons(['reaper']), up)
    expect(stats.maxHealth).toBe(120 + 30)
    expect(stats.speedMult).toBeCloseTo(1.1 + 0.08, 5)
    expect(stats.cdr).toBeCloseTo(0.15 + 0.12, 5)
  })

  it('caps cooldown reduction so abilities never go free', () => {
    const up = { ...emptyUpgrades(), focus: 3 }
    const stats = deriveStats(withWeapons(['reaper']), up)
    expect(stats.cdr).toBeLessThanOrEqual(0.6)
  })
})
