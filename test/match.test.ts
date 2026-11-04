import { describe, expect, it } from 'vitest'
import { createWorld, stepWorld } from '../src/sim/match'
import { emptyUpgrades } from '../src/data/upgrades'
import { emptyInput } from '../src/sim/types'
import type { Loadout } from '../src/sim/types'
import { aabbOverlap } from '../src/core/math'
import { playerBox } from '../src/sim/collision'

const loadout: Loadout = {
  slots: ['reaper', 'breacher', 'katana', 'hellfire', null, null, null],
}

describe('headless match', () => {
  it('spawns the player in the open courtyard, not inside the default building', () => {
    const world = createWorld({
      mapId: 'hollow-ward',
      loadout,
      upgrades: emptyUpgrades(),
      botCount: 0,
      difficulty: 'normal',
    })
    const player = world.players[0]

    expect(player.pos.x).toBeCloseTo(0)
    expect(player.pos.z).toBeGreaterThan(40)
    expect(world.colliders.some((collider) => aabbOverlap(playerBox(player.pos, player.height), collider))).toBe(false)
  })

  it('simulates a full minute of bots without producing bad state', () => {
    const world = createWorld({
      mapId: 'hollow-ward',
      loadout,
      upgrades: emptyUpgrades(),
      botCount: 5,
      difficulty: 'normal',
      seed: 42,
    })
    const startPositions = world.players.map((p) => ({ ...p.pos }))

    for (let i = 0; i < 60 * 60; i++) {
      stepWorld(world, emptyInput(), 1 / 60)
    }

    expect(world.time).toBeGreaterThan(59)
    for (const p of world.players) {
      expect(Number.isFinite(p.pos.x)).toBe(true)
      expect(Number.isFinite(p.pos.y)).toBe(true)
      expect(Number.isFinite(p.pos.z)).toBe(true)
      expect(Number.isFinite(p.vel.x)).toBe(true)
      expect(p.health).toBeGreaterThanOrEqual(0)
      expect(p.health).toBeLessThanOrEqual(p.stats.maxHealth + 0.001)
    }

    const bots = world.players.filter((p) => p.isBot)
    const moved = bots.filter((b, i) => {
      const start = startPositions[i + 1]
      return Math.hypot(b.pos.x - start.x, b.pos.z - start.z) > 1
    })
    expect(moved.length).toBeGreaterThan(0)

    // Bots should be able to find and damage each other over a minute.
    expect(world.players.reduce((sum, p) => sum + p.kills, 0)).toBeGreaterThan(0)
  })

  it('ends the match when the score limit is reached', () => {
    const world = createWorld({
      mapId: 'skyfoundry',
      loadout,
      upgrades: emptyUpgrades(),
      botCount: 1,
      difficulty: 'easy',
      seed: 7,
    })
    const hero = world.players[0]
    hero.score = world.match.scoreLimit - 1
    hero.kills = world.match.scoreLimit - 1
    // Force a kill through the normal pipeline.
    const bot = world.players[1]
    bot.pos = { x: hero.pos.x + 2, y: hero.pos.y, z: hero.pos.z }
    hero.slot = 0
    hero.yaw = Math.atan2(-(bot.pos.x - hero.pos.x), -(bot.pos.z - hero.pos.z))
    for (let i = 0; i < 200 && !world.match.ended; i++) {
      bot.health = 10
      bot.pos = { x: hero.pos.x + 2, y: hero.pos.y, z: hero.pos.z }
      stepWorld(
        world,
        { ...emptyInput(), yaw: hero.yaw, pitch: 0, fire: true },
        1 / 60,
      )
    }
    expect(world.match.ended).toBe(true)
    expect(world.match.winnerId).toBe(0)
  })
})
