import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/sim/match'
import { createPlayer, emptyLoadout } from '../src/sim/player'
import { emptyUpgrades } from '../src/data/upgrades'
import { cleanState } from './helpers'
import { applyDamage, EXPOSED_TIME } from '../src/sim/damage'
import { wallDamage } from '../src/sim/combat'
import { updateEffects, useAbility } from '../src/sim/abilities'
import { emptyInput } from '../src/sim/types'
import type { Player, World } from '../src/sim/types'
import { stepWorld } from '../src/sim/match'

function arena(): { world: World; shooter: Player; victim: Player } {
  const loadout = emptyLoadout()
  loadout.slots[0] = 'gilded'
  const world = createWorld({
    mapId: 'hollow-ward',
    loadout,
    upgrades: emptyUpgrades(),
    botCount: 0,
    difficulty: 'normal',
  })
  const shooter = world.players[0]
  cleanState(shooter)
  const victim = createPlayer({
    id: 1,
    name: 'TARGET',
    slot: 0,
    spawn: { x: 0, y: 0.02, z: -6 },
    loadout: { slots: ['reaper', null, null, null, null, null, null] },
    upgrades: emptyUpgrades(),
  })
  cleanState(victim)
  world.players.push(victim)
  return { world, shooter, victim }
}

describe('wall penetration table', () => {
  it('matches the design doc numbers', () => {
    expect(wallDamage(0, true).fraction).toBe(2)
    expect(wallDamage(0, false).fraction).toBe(0.9)
    expect(wallDamage(1, true).fraction).toBe(1.7)
    expect(wallDamage(2, false).fraction).toBe(0.8)
    expect(wallDamage(4, true).fraction).toBe(1)
    expect(wallDamage(4, false).fraction).toBe(0.7)
  })

  it('caps shots through five or more walls so they cannot kill', () => {
    expect(wallDamage(5, true).leaveAt).toBe(0.1)
    expect(wallDamage(9, false).leaveAt).toBe(0.3)
  })
})

describe('damage and lethal rules', () => {
  it('kills on a lethal hit', () => {
    const { world, shooter, victim } = arena()
    applyDamage(world, victim, shooter.id, 10, { source: 'bullet', weaponId: 'gilded', lethal: true, headshot: true })
    expect(victim.alive).toBe(false)
    expect(victim.deaths).toBe(1)
    expect(shooter.kills).toBe(1)
  })

  it('never kills on a failed lethal condition', () => {
    const { world, shooter, victim } = arena()
    victim.health = 100
    applyDamage(world, victim, shooter.id, 999, {
      source: 'bullet',
      weaponId: 'gilded',
      nonLethalFrac: 0.5,
    })
    expect(victim.alive).toBe(true)
    // 50% of the target's max health (120 with the Specialist package), never a kill.
    expect(victim.health).toBeCloseTo(100 - victim.stats.maxHealth * 0.5, 5)
  })

  it('increases damage taken while Exposed', () => {
    const { world, shooter, victim } = arena()
    victim.exposedUntil = world.time + EXPOSED_TIME
    const dealt = applyDamage(world, victim, shooter.id, 40, { source: 'bullet', weaponId: 'gilded' })
    expect(dealt).toBeCloseTo(50, 5)
  })

  it('applies Exposed when a lethal window expires without a kill', () => {
    const { world, shooter } = arena()
    const rt = shooter.weapons['gilded']
    rt.tCharge = 9999
    const used = useAbility(world, shooter, 'T')
    expect(used).toBe(true)
    expect(shooter.effects.length).toBe(1)

    world.time += 7
    updateEffects(world, shooter, 1 / 60)
    expect(shooter.exposedUntil).toBeGreaterThan(world.time)
    expect(shooter.effects.length).toBe(0)
    // Lethal Strain extends the power's cooldown.
    expect(rt.tCooldown).toBeGreaterThan(0)
  })

  it('awards style points for damage during a slide', () => {
    const { world, shooter, victim } = arena()
    shooter.sliding = true
    applyDamage(world, victim, shooter.id, 10, { source: 'bullet', weaponId: 'gilded' })
    expect(shooter.sp).toBeGreaterThan(0)
  })
})

describe('match tick', () => {
  it('respawns a dead player after the timer', () => {
    const { world, victim } = arena()
    applyDamage(world, victim, 0, 999, { source: 'bullet', weaponId: 'reaper', lethal: true })
    expect(victim.alive).toBe(false)
    for (let i = 0; i < 60 * 4; i++) stepWorld(world, emptyInput(), 1 / 60)
    expect(victim.alive).toBe(true)
    expect(victim.health).toBe(victim.stats.maxHealth)
  })
})
