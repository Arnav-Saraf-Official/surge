import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/sim/match'
import { createPlayer, emptyLoadout } from '../src/sim/player'
import { emptyUpgrades } from '../src/data/upgrades'
import { weapon as weaponDef, WEAPONS } from '../src/data/weapons'
import { cleanState } from './helpers'
import { fireWeapon, knifeCurve, knifeFlurry, updateProjectiles, useBladeAlt, KNIFE_CHASE_LIFE } from '../src/sim/combat'
import type { Player, Projectile, World } from '../src/sim/types'

function arena(weaponId = 'knives'): { world: World; player: Player } {
  const loadout = emptyLoadout()
  loadout.slots[0] = weaponId
  const world = createWorld({
    mapId: 'hollow-ward',
    loadout,
    upgrades: emptyUpgrades(),
    botCount: 0,
    difficulty: 'normal',
  })
  const player = world.players[0]
  cleanState(player)
  player.yaw = 0
  player.pitch = 0
  world.colliders = []
  return { world, player }
}

function enemy(world: World, pos: { x: number; y: number; z: number }, yaw = 0): Player {
  const victim = createPlayer({
    id: world.players.length,
    name: 'TARGET',
    slot: 0,
    spawn: pos,
    loadout: { slots: ['reaper', null, null, null, null, null, null] },
    upgrades: emptyUpgrades(),
  })
  cleanState(victim, pos)
  victim.yaw = yaw
  world.players.push(victim)
  return victim
}

function stepKnives(world: World, seconds: number): void {
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) updateProjectiles(world, dt)
}

describe('blade right-click loadout', () => {
  it('gives every blade a right-click technique', () => {
    for (const blade of WEAPONS.filter((w) => w.type === 'blade')) {
      expect(blade.alt, blade.id).toBeTruthy()
    }
    expect(weaponDef('katana').alt?.kind).toBe('deflect')
    expect(weaponDef('scythe').alt?.kind).toBe('reap')
    expect(weaponDef('kris').alt?.kind).toBe('blink')
    expect(weaponDef('knives').alt?.kind).toBe('throw')
  })

  it('cuts with both knives on left click', () => {
    const { world, player } = arena()
    const a = enemy(world, { x: -0.4, y: 0.02, z: 18.8 })
    const b = enemy(world, { x: 0.4, y: 0.02, z: 18.8 })
    expect(fireWeapon(world, player)).toBe(true)
    expect(a.health).toBeLessThan(a.stats.maxHealth)
    expect(b.health).toBeLessThan(b.stats.maxHealth)
  })

  it('lands both blades on a lone target', () => {
    const { world, player } = arena()
    const target = enemy(world, { x: 0, y: 0.02, z: 18.8 })
    expect(fireWeapon(world, player)).toBe(true)
    expect(target.stats.maxHealth - target.health).toBeGreaterThan(2 * weaponDef('knives').fire.damage)
  })

  it('throws one knife on right-click release and then respects its cooldown', () => {
    const { world, player } = arena()
    expect(useBladeAlt(world, player)).toBe(true)
    expect(world.projectiles.filter((p) => p.kind === 'knife')).toHaveLength(1)
    expect(player.weapons.knives.altCooldown).toBeGreaterThan(0)
    expect(useBladeAlt(world, player)).toBe(false)
  })
})

describe('throwing knives', () => {
  it('throws sixteen Flurry blades on separate angles', () => {
    const { world, player } = arena()
    knifeFlurry(world, player)
    const knives = world.projectiles.filter((p) => p.kind === 'knife')
    expect(knives).toHaveLength(16)
    const angles = new Set(
      knives.map((p) => Math.round((Math.atan2(p.vel.z, p.vel.x) * 180) / Math.PI)),
    )
    expect(angles.size).toBe(16)
  })

  it('Curve Ball homes around cover, then pauses on a dead target and resumes on respawn', () => {
    const { world, player } = arena()
    const target = enemy(world, { x: 10, y: 0.02, z: 0 })
    // A wall between the thrower and the target forces a detour.
    world.colliders = [{ min: { x: -2, y: 0, z: 4 }, max: { x: 12, y: 4, z: 6 } }]
    knifeCurve(world, player)
    const knives = world.projectiles.filter((p) => p.kind === 'knife')
    expect(knives).toHaveLength(5)
    expect(knives.every((p) => p.chase && p.life === KNIFE_CHASE_LIFE)).toBe(true)

    const nearest = () => Math.min(...world.projectiles.map((p) => Math.hypot(p.pos.x - target.pos.x, p.pos.z - target.pos.z)))
    const start = nearest()
    stepKnives(world, 2)
    expect(world.projectiles.length).toBeGreaterThan(0)
    expect(nearest()).toBeLessThan(start)

    // The target dies: the surviving blades hold position.
    target.alive = false
    stepKnives(world, 0.5)
    const held = world.projectiles.map((p) => ({ x: p.pos.x, y: p.pos.y, z: p.pos.z }))
    stepKnives(world, 1)
    const after = world.projectiles.map((p) => ({ x: p.pos.x, y: p.pos.y, z: p.pos.z }))
    expect(after).toEqual(held)

    // Respawn: the chase picks back up.
    target.alive = true
    target.health = target.stats.maxHealth
    target.pos = { x: 10, y: 0.02, z: 0 }
    const pausedDistance = nearest()
    stepKnives(world, 1)
    expect(nearest()).toBeLessThan(pausedDistance)
  })

  it('despawns chasing knives after 45 seconds even when the target is dead', () => {
    const { world, player } = arena()
    const target = enemy(world, { x: 10, y: 0.02, z: 0 })
    knifeCurve(world, player)
    target.alive = false
    stepKnives(world, 46)
    expect(world.projectiles.filter((p) => p.kind === 'knife')).toHaveLength(0)
  })

  it('damages a target that stands in the way of a thrown knife', () => {
    const { world, player } = arena()
    const target = enemy(world, { x: 0, y: 0.02, z: 10 })
    const knife: Projectile = {
      id: 999,
      ownerId: player.id,
      weaponId: 'knives',
      pos: { x: 0, y: 1.2, z: 16 },
      vel: { x: 0, y: 0, z: -30 },
      damage: 50,
      splashRadius: 0,
      life: 2,
      guided: false,
      cluster: false,
      gravity: 4,
      kind: 'knife',
      targetId: target.id,
    }
    world.projectiles.push(knife)
    stepKnives(world, 1)
    expect(target.health).toBeLessThan(target.stats.maxHealth)
    expect(world.projectiles).toHaveLength(0)
  })
})

describe('katana bullet deflect', () => {
  it('parries a frontal shot and sends damage back at the shooter', () => {
    const { world, player: defender } = arena('katana')
    const shooter = enemy(world, { x: 0, y: 0.02, z: 14 }, Math.PI)
    const startHealth = defender.health

    expect(useBladeAlt(world, defender)).toBe(true)
    shooter.weapons.reaper.nextShotAt = world.time
    expect(fireWeapon(world, shooter)).toBe(true)

    expect(defender.health).toBe(startHealth)
    expect(shooter.health).toBeLessThan(shooter.stats.maxHealth)
  })

  it('does not parry once the window closes', () => {
    const { world, player: defender } = arena('katana')
    const shooter = enemy(world, { x: 0, y: 0.02, z: 14 }, Math.PI)

    expect(useBladeAlt(world, defender)).toBe(true)
    world.time += 2
    shooter.weapons.reaper.nextShotAt = world.time
    expect(fireWeapon(world, shooter)).toBe(true)

    expect(defender.health).toBeLessThan(defender.stats.maxHealth)
  })
})

describe('scythe and kris techniques', () => {
  it('Void Reap cuts and pulls in nearby enemies only', () => {
    const { world, player } = arena('scythe')
    const near = enemy(world, { x: 1, y: 0.02, z: 19 })
    const far = enemy(world, { x: 0, y: 0.02, z: 4 })

    expect(useBladeAlt(world, player)).toBe(true)
    expect(near.health).toBeLessThan(near.stats.maxHealth)
    expect(near.vel.x).toBeLessThan(0)
    expect(far.health).toBe(far.stats.maxHealth)
  })

  it('Blink Strike teleports behind a nearby enemy and stabs', () => {
    const { world, player } = arena('kris')
    const target = enemy(world, { x: 0, y: 0.02, z: 15 }, Math.PI)

    expect(useBladeAlt(world, player)).toBe(true)
    expect(player.pos.z).toBeLessThan(target.pos.z)
    expect(Math.abs(player.pos.z - target.pos.z)).toBeLessThan(2)
    expect(target.health).toBeLessThan(target.stats.maxHealth)
  })
})
