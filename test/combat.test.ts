import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/sim/match'
import { createPlayer, emptyLoadout, makeWeaponRuntime } from '../src/sim/player'
import { emptyUpgrades } from '../src/data/upgrades'
import { cleanState } from './helpers'
import { applyDamage, EXPOSED_TIME } from '../src/sim/damage'
import { wallDamage } from '../src/sim/combat'
import { fireWeapon } from '../src/sim/combat'
import { effectSpeedMult } from '../src/sim/movement'
import { abilityForSlot, abilityStatus, updateEffects, useAbility } from '../src/sim/abilities'
import { emptyInput } from '../src/sim/types'
import type { Player, World } from '../src/sim/types'
import { stepWorld } from '../src/sim/match'

function arena(weaponId = 'gilded'): { world: World; shooter: Player; victim: Player } {
  const loadout = emptyLoadout()
  loadout.slots[0] = weaponId
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
  it('unlocks Phantom Sight for Ghostline and Katana, penetrates walls, and ends after four shots', () => {
    const { world, shooter, victim } = arena('ghostline')
    expect(abilityForSlot(shooter, 'T')?.name).toBe('Wall Piercer')
    shooter.loadout.slots[1] = 'katana'
    shooter.weapons.katana = makeWeaponRuntime('katana')
    world.colliders = [{ min: { x: -2, y: 0, z: -3 }, max: { x: 2, y: 3, z: -2 } }]
    shooter.pos = { x: 0, y: 0.02, z: 0 }
    shooter.yaw = 0
    shooter.pitch = 0
    shooter.aiming = true
    victim.pos = { x: 0, y: 0.02, z: -6 }

    expect(abilityForSlot(shooter, 'T')?.name).toBe('Phantom Sight')
    expect(useAbility(world, shooter, 'T')).toBe(true)
    expect(shooter.effects.some((effect) => effect.abilityId === 'phantomSight')).toBe(true)
    shooter.slot = 1
    expect(useAbility(world, shooter, 'F')).toBe(true)
    world.time += 1
    shooter.weapons.katana.fCooldown = 0
    expect(useAbility(world, shooter, 'F')).toBe(false)
    shooter.slot = 0

    for (let shot = 0; shot < 4; shot++) {
      shooter.weapons.ghostline.nextShotAt = world.time
      expect(fireWeapon(world, shooter)).toBe(true)
      if (shot === 0) expect(victim.health).toBeLessThan(victim.stats.maxHealth)
      world.time += 2
    }

    expect(shooter.effects.some((effect) => effect.abilityId === 'phantomSight')).toBe(false)
    expect(world.events.some((event) => event.type === 'abilityEnd' && event.abilityId === 'phantomSight')).toBe(true)
  })

  it('restores Phantom Sight vision briefly when the player takes damage', () => {
    const { world, shooter, victim } = arena('ghostline')
    shooter.loadout.slots[1] = 'katana'
    shooter.weapons.katana = makeWeaponRuntime('katana')
    expect(useAbility(world, shooter, 'T')).toBe(true)

    applyDamage(world, shooter, victim.id, 10, { source: 'ability', weaponId: 'reaper' })
    const phantom = shooter.effects.find((effect) => effect.abilityId === 'phantomSight')
    expect(phantom?.visionRestoredUntil).toBe(world.time + 1.5)
  })

  it('reduces normal bullet damage', () => {
    const { world, shooter, victim } = arena()
    const dealt = applyDamage(world, victim, shooter.id, 40, { source: 'bullet', weaponId: 'gilded' })
    expect(dealt).toBeCloseTo(32, 5)
  })

  it('charges T abilities from damage and applies Focus scaling', () => {
    const { world, shooter, victim } = arena()
    shooter.stats.tChargeMult = 1.5
    applyDamage(world, victim, shooter.id, 40, { source: 'bullet', weaponId: 'gilded' })
    expect(shooter.weapons.gilded.tCharge).toBeCloseTo(32 * 1.5, 5)
  })

  it('makes Heavy Shot boost only the next fired shot', () => {
    const normal = arena()
    const boosted = arena()
    for (const { shooter, victim } of [normal, boosted]) {
      shooter.pos = { x: 0, y: 0.02, z: 20 }
      shooter.yaw = 0
      shooter.pitch = 0
      shooter.aiming = true
      victim.pos = { x: 0, y: 0.02, z: 15 }
    }
    expect(fireWeapon(normal.world, normal.shooter)).toBe(true)
    expect(useAbility(boosted.world, boosted.shooter, 'F')).toBe(true)
    expect(fireWeapon(boosted.world, boosted.shooter)).toBe(true)
    const normalDamage = normal.victim.stats.maxHealth - normal.victim.health
    const boostedDamage = boosted.victim.stats.maxHealth - boosted.victim.health
    expect(boostedDamage).toBeGreaterThan(normalDamage * 1.29)
    expect(boosted.shooter.effects.some((e) => e.effects.some((eff) => eff.kind === 'nextShot'))).toBe(false)
  })

  it('keeps Quick-Scope Lock armed after a miss and starts cooldown on an in-sweep headshot', () => {
    const { world, shooter, victim } = arena('ghostline')
    world.colliders = []
    shooter.pos = { x: 0, y: 0.02, z: 0 }
    shooter.yaw = 0
    shooter.pitch = 0
    victim.pos = { x: 10, y: 0.02, z: -12 }

    expect(useAbility(world, shooter, 'F')).toBe(true)
    expect(shooter.weapons.ghostline.fCooldown).toBe(0)
    expect(shooter.weapons.ghostline.tCooldown).toBe(0)
    expect(abilityStatus(world, shooter, 'F')?.ready).toBe(false)
    expect(fireWeapon(world, shooter)).toBe(true)
    expect(victim.alive).toBe(true)
    expect(shooter.weapons.ghostline.fCooldown).toBe(0)
    expect(shooter.effects.some((effect) => effect.abilityId === 'quickScope')).toBe(true)

    // This target is farther than the normal 300m shot range, but inside the
    // Quick-Scope 30-degree sweep and its modestly extended range.
    world.time = shooter.weapons.ghostline.nextShotAt
    victim.pos = { x: 150, y: 0.02, z: -280 }
    expect(fireWeapon(world, shooter)).toBe(true)
    expect(victim.alive).toBe(false)
    expect(world.events.some((event) => event.type === 'kill' && event.victimId === victim.id && event.headshot)).toBe(true)
    expect(shooter.weapons.ghostline.fCooldown).toBeCloseTo(20 * (1 - shooter.stats.cdr))
    expect(shooter.effects.some((effect) => effect.abilityId === 'quickScope')).toBe(false)
  })

  it('applies Shockwave slow to nearby enemies', () => {
    const { world, shooter, victim } = arena('thunderclap')
    victim.pos = { x: 0, y: 0.02, z: 24 }
    expect(useAbility(world, shooter, 'F')).toBe(true)
    expect(effectSpeedMult(victim)).toBeCloseTo(0.5, 5)
    world.time += 2.6
    updateEffects(world, victim, 2.6)
    expect(effectSpeedMult(victim)).toBe(1)
  })

  it('makes Door-Kick Sweep hit all enemies within two player widths for 75% pellet damage', () => {
    const { world, shooter, victim } = arena('breacher')
    shooter.pos = { x: 0, y: 0.02, z: 0 }
    cleanState(victim, { x: 0, y: 0.02, z: 1.5 })
    const outside = createPlayer({
      id: 2,
      name: 'OUTSIDE',
      slot: 0,
      spawn: { x: 1.7, y: 0.02, z: 0 },
      loadout: { slots: ['reaper', null, null, null, null, null, null] },
      upgrades: emptyUpgrades(),
    })
    cleanState(outside, outside.pos)
    world.players.push(outside)

    expect(useAbility(world, shooter, 'F')).toBe(true)
    expect(victim.health).toBeCloseTo(victim.stats.maxHealth - 11 * 9 * 0.75)
    expect(outside.health).toBe(outside.stats.maxHealth)
    expect(shooter.weapons.breacher.fCooldown).toBeGreaterThan(0)
  })

  it('kills on a lethal hit, including condition-only lethal hits with no base damage', () => {
    const { world, shooter, victim } = arena()
    applyDamage(world, victim, shooter.id, 0, { source: 'bullet', weaponId: 'gilded', lethal: true, headshot: true })
    expect(victim.alive).toBe(false)
    expect(victim.deaths).toBe(1)
    expect(shooter.kills).toBe(1)
  })

  it('allows a valid Specter backstab shot to satisfy its lethal condition', () => {
    const { world, shooter, victim } = arena('specter')
    shooter.pos = { x: 0, y: 0.02, z: 5 }
    shooter.yaw = 0
    shooter.aiming = true
    victim.pos = { x: 0, y: 0.02, z: -4 }
    victim.yaw = 0
    world.colliders = []
    shooter.weapons.specter.tCharge = 850
    expect(useAbility(world, shooter, 'T')).toBe(true)
    expect(fireWeapon(world, shooter)).toBe(true)
    expect(victim.alive).toBe(false)
    expect(shooter.weapons.specter.tCooldown).toBeLessThan(30)
  })

  it('does not make Point-Blank Slam lethal beyond four metres', () => {
    const { world, shooter, victim } = arena('breacher')
    shooter.pos = { x: 0, y: 0.02, z: 0 }
    shooter.yaw = 0
    shooter.aiming = true
    victim.pos = { x: 0, y: 0.02, z: -4.5 }
    world.colliders = []
    shooter.weapons.breacher.tCharge = 1000
    expect(useAbility(world, shooter, 'T')).toBe(true)
    expect(fireWeapon(world, shooter)).toBe(true)
    expect(victim.alive).toBe(true)
  })

  it('starts Sensor Sweep with a reveal radius and duration', () => {
    const { world, shooter } = arena('aurora')
    expect(useAbility(world, shooter, 'F')).toBe(true)
    expect(shooter.revealUntil).toBeGreaterThan(world.time)
    expect(shooter.revealRadius).toBe(55)
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
    expect(dealt).toBeCloseTo(40, 5)
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
