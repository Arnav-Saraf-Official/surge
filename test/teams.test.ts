import { describe, expect, it } from 'vitest'
import { createWorld, stepWorld } from '../src/sim/match'
import { createPlayer } from '../src/sim/player'
import { emptyUpgrades } from '../src/data/upgrades'
import { applyDamage } from '../src/sim/damage'
import { WEAPONS } from '../src/data/weapons'
import { emptyInput } from '../src/sim/types'
import type { Loadout, Player, World } from '../src/sim/types'
import { cleanState } from './helpers'

const loadout: Loadout = { slots: ['reaper', null, null, null, null, null, null] }

function teamWorld(): World {
  return createWorld({
    mapId: 'hollow-ward',
    loadout,
    upgrades: emptyUpgrades(),
    botCount: 7,
    difficulty: 'normal',
    mode: 'tdm',
    seed: 3,
  })
}

function dummy(world: World, team: number, id = world.players.length): Player {
  const p = createPlayer({
    id,
    name: 'DUMMY',
    slot: 0,
    team,
    loadout,
    upgrades: emptyUpgrades(),
    spawn: { x: 2, y: 0.02, z: 20 },
  })
  cleanState(p, { x: 2, y: 0.02, z: 20 })
  world.players.push(p)
  return p
}

describe('team deathmatch', () => {
  it('splits the hero and bots into two even teams', () => {
    const world = teamWorld()
    expect(world.match.mode).toBe('tdm')
    expect(world.match.teamScores).toEqual([0, 0])

    const alpha = world.players.filter((p) => p.team === 0)
    const bravo = world.players.filter((p) => p.team === 1)
    expect(alpha).toHaveLength(4)
    expect(bravo).toHaveLength(4)
    expect(world.players[0].team).toBe(0)
  })

  it('blocks friendly fire but lets enemies take damage', () => {
    const world = teamWorld()
    const hero = world.players[0]
    const ally = dummy(world, 0)
    const enemy = dummy(world, 1)

    const allyHealth = ally.health
    expect(
      applyDamage(world, ally, hero.id, 50, { source: 'bullet', weaponId: 'reaper' }),
    ).toBe(0)
    expect(ally.health).toBe(allyHealth)

    expect(
      applyDamage(world, enemy, hero.id, 50, { source: 'bullet', weaponId: 'reaper' }),
    ).toBeGreaterThan(0)
    expect(enemy.health).toBeLessThan(enemy.stats.maxHealth)
  })

  it('awards team score for enemy kills and ends the match at the limit', () => {
    const world = teamWorld()
    const hero = world.players[0]
    const enemy = dummy(world, 1)

    applyDamage(world, enemy, hero.id, 9999, { source: 'bullet', weaponId: 'reaper' })
    expect(world.match.teamScores[0]).toBe(1)
    expect(hero.score).toBe(1)
    expect(world.match.ended).toBe(false)

    world.match.teamScores[0] = world.match.scoreLimit - 1
    const second = dummy(world, 1)
    applyDamage(world, second, hero.id, 9999, { source: 'bullet', weaponId: 'reaper' })
    stepWorld(world, emptyInput(), 1 / 60)

    expect(world.match.ended).toBe(true)
    expect(world.match.winnerTeam).toBe(0)
    expect(
      world.events.some((e) => e.type === 'matchEnd' && e.winnerTeam === 0),
    ).toBe(true)
  })

  it('runs a bot team match without friendly damage or friendly kills', () => {
    const world = teamWorld()
    for (let i = 0; i < 60 * 20; i++) stepWorld(world, emptyInput(), 1 / 60)

    for (const event of world.events) {
      if (event.type !== 'damage' && event.type !== 'kill') continue
      const attackerId = event.type === 'damage' ? event.fromId : event.killerId
      const victimId = event.type === 'damage' ? event.playerId : event.victimId
      const attacker = world.players.find((p) => p.id === attackerId)
      const victim = world.players.find((p) => p.id === victimId)
      if (!attacker || !victim || attacker.id === victim.id) continue
      expect(attacker.team, `${event.type} ${attacker.name} -> ${victim.name}`).not.toBe(victim.team)
    }

    const teamKills = world.players.reduce((sum, p) => sum + p.kills, 0)
    expect(world.match.teamScores[0] + world.match.teamScores[1]).toBe(teamKills)
  })

  it('uses the requested ally and enemy bot counts', () => {
    const world = createWorld({
      mapId: 'hollow-ward',
      loadout,
      upgrades: emptyUpgrades(),
      botCount: 1,
      allyBots: 2,
      enemyBots: 5,
      difficulty: 'normal',
      mode: 'tdm',
      seed: 3,
    })

    expect(world.players.filter((p) => p.team === 0)).toHaveLength(3)
    expect(world.players.filter((p) => p.team === 1)).toHaveLength(5)
  })

  it('gives every blade a different primary ability', () => {
    const blades = WEAPONS.filter((w) => w.type === 'blade')
    const ids = new Set(blades.map((b) => b.f.id))
    const signatures = blades.map((b) => b.f.effects.map((e) => e.kind).sort().join(','))
    expect(ids.size).toBe(blades.length)
    expect(new Set(signatures).size).toBe(blades.length)
  })
})
