import { aabbOverlap, dist, distXZ, v3 } from '../core/math'
import { Rng } from '../core/rng'
import { getMap, terrainHeight } from '../data/maps'
import type { UpgradeKey, WeaponType } from '../data/types'
import { weapon as weaponDef } from '../data/weapons'
import { fireGrapple, stepMovement } from './movement'
import { fireWeapon, meleeAttack, startReload, tickWeapons, updateProjectiles, useBladeAlt } from './combat'
import { killPlayer, updateRegen } from './damage'
import { botInput, BOT_SKILL, type BotDifficulty } from './bots'
import { drainSp } from './style'
import { spendStyle, updateEffects, useAbility } from './abilities'
import { createPlayer, deriveStats, emptyLoadout, makeWeaponRuntime, SLOT_COUNT } from './player'
import { emptyInput } from './types'
import type { InputCmd, Loadout, Orb, Player, World } from './types'
import type { MapDef } from '../data/types'
import { emptyUpgrades } from '../data/upgrades'
import { STAND_HEIGHT, playerBox } from './collision'

export const DEFAULT_SCORE_LIMIT = 25
export const DEFAULT_TIME_LIMIT = 480
export const ORB_RESPAWN = 45

export interface MatchConfig {
  mapId: string
  loadout: Loadout
  upgrades: Record<UpgradeKey, number>
  botCount: number
  difficulty: BotDifficulty
  mode?: 'ffa' | 'training'
  scoreLimit?: number
  timeLimit?: number
  seed?: number
  playerName?: string
}

const BOT_NAMES = [
  'VESPER',
  'KILO',
  'NOMAD',
  'HALCYON',
  'DRIFT',
  'SABLE',
  'TALON',
  'ORACLE',
  'RIPTIDE',
  'CINDER',
]

export const BOT_LOADOUTS: string[][] = [
  ['breacher', 'katana', 'reaper'],
  ['ghostline', 'gilded', 'breacher'],
  ['hellfire', 'reaper', 'gilded'],
  ['katana', 'ghostline', 'breacher'],
  ['warhound', 'breacher', 'gilded'],
  ['reaper', 'hellfire', 'katana'],
  ['phantom', 'cyclone', 'specter'],
  ['aurora', 'thunderclap', 'scythe'],
  ['vortex', 'phantom', 'cyclone'],
  ['specter', 'scythe', 'aurora'],
  ['verdict', 'tempest', 'kris'],
  ['cinder', 'verdict', 'ghostline'],
]

function collidersFor(map: MapDef) {
  return map.boxes.map((b) => ({
    min: v3(b.pos[0] - b.size[0] / 2, b.pos[1] - b.size[1] / 2, b.pos[2] - b.size[2] / 2),
    max: v3(b.pos[0] + b.size[0] / 2, b.pos[1] + b.size[1] / 2, b.pos[2] + b.size[2] / 2),
  }))
}

function spawnBlocked(world: World, p: ReturnType<typeof v3>): boolean {
  const box = playerBox(p, STAND_HEIGHT)
  return world.colliders.some((c) => aabbOverlap(box, c))
}

/** Highest solid surface under (x, z) at or just below the given height. */
function surfaceBelow(world: World, x: number, z: number, fromY: number, maxDrop: number): number | null {
  let best: number | null = null
  for (const c of world.colliders) {
    if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue
    if (c.max.y <= fromY + 0.02 && c.max.y >= fromY - maxDrop) {
      if (best === null || c.max.y > best) best = c.max.y
    }
  }
  return best
}

/**
 * Turn an authored spawn point into a legal one: lift out of any geometry,
 * then settle onto the nearest floor below so spawns never start inside
 * buildings, aircraft or canopy platforms.
 */
export function safeSpawn(world: World, spawn: [number, number, number]): ReturnType<typeof v3> {
  const p = v3(spawn[0], spawn[1], spawn[2])
  let guard = 0
  while (spawnBlocked(world, p) && guard < 160) {
    p.y += 0.25
    guard++
  }
  const top = surfaceBelow(world, p.x, p.z, p.y + 0.1, 3.5)
  if (top !== null) p.y = top + 0.02
  p.y = Math.max(p.y, terrainHeight(world.map, p.x, p.z) + 0.02)
  if (spawnBlocked(world, p)) p.y = 60
  return p
}

export function createWorld(cfg: MatchConfig): World {
  const map = getMap(cfg.mapId)
  const rng = new Rng(cfg.seed ?? 1337)
  const orbs: Orb[] = map.orbs.map((p, i) => ({
    id: i + 1,
    pos: v3(p[0], p[1], p[2]),
    amount: 30,
    respawnAt: 0,
    active: true,
    temporary: false,
  }))

  const world: World = {
    map,
    colliders: collidersFor(map),
    colliderKinds: map.boxes.map((b) => b.kind ?? 'world'),
    players: [],
    projectiles: [],
    orbs,
    time: 0,
    tick: 0,
    events: [],
    rng,
    nextEntityId: orbs.length + 1,
    match: {
      mode: cfg.mode ?? 'ffa',
      scoreLimit: cfg.scoreLimit ?? DEFAULT_SCORE_LIMIT,
      timeLimit: cfg.timeLimit ?? DEFAULT_TIME_LIMIT,
      startedAt: 0,
      ended: false,
      winnerId: null,
      wave: 1,
    },
  }

  const spawnAt = (index: number) => safeSpawn(world, map.spawns[index % map.spawns.length])

  const hero = createPlayer({
    id: 0,
    name: cfg.playerName ?? 'YOU',
    slot: 0,
    loadout: cfg.loadout,
    upgrades: cfg.upgrades,
    spawn: spawnAt(0),
  })
  hero.slot = firstSlot(hero)
  world.players.push(hero)

  for (let i = 0; i < cfg.botCount; i++) {
    const loadout = emptyLoadout()
    const picks = BOT_LOADOUTS[i % BOT_LOADOUTS.length]
    const slots = [0, 1, 4, 6]
    picks.forEach((id, idx) => {
      loadout.slots[slots[idx % slots.length]] = id
    })
    const bot = createPlayer({
      id: i + 1,
      name: BOT_NAMES[i % BOT_NAMES.length],
      slot: 0,
      isBot: true,
      botSkill: BOT_SKILL[cfg.difficulty],
      loadout,
      upgrades: randomUpgrades(rng),
      spawn: spawnAt(i + 1),
    })
    bot.slot = firstSlot(bot)
    // Face the middle of the map at spawn.
    bot.yaw = Math.atan2(-(0 - bot.pos.x), -(0 - bot.pos.z))
    if (bot.botBrain) bot.botBrain.aimYaw = bot.yaw
    world.players.push(bot)
    void deriveStats
  }

  return world
}

function randomUpgrades(rng: Rng): Record<UpgradeKey, number> {
  const up = emptyUpgrades()
  const keys: UpgradeKey[] = ['vitality', 'agility', 'dexterity', 'focus', 'grapple', 'might']
  for (let i = 0; i < 5; i++) {
    const key = rng.pick(keys)
    if (up[key] < 3) up[key] += 1
    else i--
  }
  return up
}

function firstSlot(player: Player): number {
  const idx = player.loadout.slots.findIndex((s) => !!s)
  return idx >= 0 ? idx : 0
}

export function respawnPlayer(world: World, player: Player): void {
  const enemies = world.players.filter((p) => p.alive && p.id !== player.id)
  let best = world.map.spawns[0]
  let bestScore = -Infinity
  if (enemies.length === 0) {
    best = world.map.spawns[world.rng.int(0, world.map.spawns.length)]
  } else {
    for (const s of world.map.spawns) {
      let score = Infinity
      for (const e of enemies) score = Math.min(score, Math.hypot(e.pos.x - s[0], e.pos.z - s[2]))
      if (score > bestScore) {
        bestScore = score
        best = s
      }
    }
  }
  player.pos = safeSpawn(world, best)
  player.vel = v3()
  player.health = player.stats.maxHealth
  player.alive = true
  player.effects = []
  player.sliding = false
  player.hiding = false
  player.hideSpotId = -1
  player.hideProgress = 0
  player.hideExitArmed = false
  player.hideReturnPos = null
  player.deployed = false
  player.grapples[0].active = false
  player.grapples[1].active = false
  player.grappling = false
  player.grappleBoostFuel = 5
  player.grappleBoosting = false
  player.invisibility = 0
  player.revealUntil = 0
  player.revealRadius = 0
  player.invulnerableUntil = world.time + 0.5
  player.lastDamageAt = world.time - 20
  player.deflectUntil = 0
  player.deflectCharges = 0
  player.slot = firstSlot(player)
  player.quickReturnSlot = -1
  for (const id of Object.keys(player.weapons)) {
    const def = weaponDef(id)
    const rt = makeWeaponRuntime(id)
    rt.fCooldown = player.weapons[id].fCooldown
    rt.tCooldown = player.weapons[id].tCooldown
    rt.tCharge = player.weapons[id].tCharge
    rt.ammo = def.fire.magazine
    player.weapons[id] = rt
  }
  world.events.push({ type: 'respawn', playerId: player.id, pos: { ...player.pos } })
}

function cycleSlot(player: Player, dir: number): void {
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const idx = (player.slot + dir * i + SLOT_COUNT * 4) % SLOT_COUNT
    if (player.loadout.slots[idx]) {
      player.slot = idx
      return
    }
  }
}

function quickUse(world: World, player: Player, type: WeaponType): void {
  if (player.quickReturnSlot >= 0) return
  const idx = player.loadout.slots.findIndex((id) => !!id && weaponDef(id).type === type)
  if (idx < 0) return
  const previous = player.slot
  player.slot = idx
  const id = player.loadout.slots[idx]
  if (!id) return
  if (type === 'blade') {
    const def = weaponDef(id)
    meleeAttack(world, player, def)
    if (def.fire.dualMelee) meleeAttack(world, player, def, 1)
  }
  else fireWeapon(world, player)
  player.quickReturnSlot = previous
  player.quickReturnAt = world.time + 0.15
}

function handleInput(world: World, player: Player, input: InputCmd): void {
  // Concealed players cannot shoot, swap or use abilities.
  if (player.hiding) return
  if (player.quickReturnSlot >= 0 && world.time >= player.quickReturnAt) {
    player.slot = player.quickReturnSlot
    player.quickReturnSlot = -1
  }
  if (input.selectSlot >= 0 && input.selectSlot < SLOT_COUNT && player.loadout.slots[input.selectSlot]) {
    player.slot = input.selectSlot
  }
  if (input.cycle !== 0) cycleSlot(player, input.cycle)

  if (input.reload) {
    const id = player.loadout.slots[player.slot]
    if (id) startReload(world, player, id)
  }

  if (input.grappleL && !player.grapples[0].active) fireGrapple(world, player, 0)
  if (input.grappleR && !player.grapples[1].active) fireGrapple(world, player, 1)

  if (input.abilityF) {
    if (input.style) spendStyle(world, player, 'flourish')
    else useAbility(world, player, 'F')
  }
  if (input.abilityT) {
    if (input.style) spendStyle(world, player, 'overcharge')
    else useAbility(world, player, 'T')
  }

  if (input.bladeQuick) quickUse(world, player, 'blade')
  if (input.explosiveQuick) quickUse(world, player, 'explosive')

  // Blade right-click: instant techniques fire on press, throws on release.
  if (input.altPress || input.altRelease) {
    const altId = player.loadout.slots[player.slot]
    const alt = altId ? weaponDef(altId).alt : undefined
    if (alt && (alt.kind === 'throw' ? input.altRelease : input.altPress)) {
      useBladeAlt(world, player)
    }
  }

  if (input.fire) fireWeapon(world, player)
}

function updateOrbs(world: World, dt: number): void {
  void dt
  const keep: Orb[] = []
  for (const orb of world.orbs) {
    if (!orb.active) {
      if (orb.temporary) continue
      if (world.time >= orb.respawnAt) orb.active = true
      keep.push(orb)
      continue
    }
    if (orb.temporary && world.time >= orb.respawnAt) continue

    let taken = false
    for (const p of world.players) {
      if (!p.alive) continue
      if (distXZ(p.pos, orb.pos) > 1.4) continue
      if (Math.abs(p.pos.y + 0.9 - orb.pos.y) > 2) continue
      p.health = Math.min(p.stats.maxHealth, p.health + orb.amount)
      p.lastCombatAt = world.time
      world.events.push({ type: 'orb', playerId: p.id, amount: orb.amount, pos: { ...orb.pos } })
      taken = true
      break
    }
    if (taken) {
      orb.active = false
      orb.respawnAt = world.time + ORB_RESPAWN
      if (orb.temporary) continue
    }
    keep.push(orb)
  }
  world.orbs = keep
}

function checkMatchEnd(world: World): void {
  if (world.match.ended || world.match.mode === 'training') return
  const elapsed = world.time - world.match.startedAt
  const leader = [...world.players].sort((a, b) => b.score - a.score)[0]
  if (leader.score >= world.match.scoreLimit) {
    world.match.ended = true
    world.match.winnerId = leader.id
    world.events.push({ type: 'matchEnd', winnerId: leader.id })
  } else if (elapsed >= world.match.timeLimit) {
    world.match.ended = true
    world.match.winnerId = leader.id
    world.events.push({ type: 'matchEnd', winnerId: leader.id })
  }
}

/** Advance the authoritative simulation by one fixed step. */
export function stepWorld(world: World, localInput: InputCmd | null, dt: number): void {
  if (world.match.ended) return
  world.time += dt
  world.tick += 1

  for (const player of world.players) {
    if (!player.alive) {
      if (world.time >= player.respawnAt) respawnPlayer(world, player)
      continue
    }

    const input =
      player.isBot
        ? botInput(world, player)
        : player.id === 0
          ? localInput ?? emptyInput()
          : emptyInput()

    handleInput(world, player, input)
    stepMovement(world, player, input, dt)
    tickWeapons(world, player, dt)
    updateEffects(world, player, dt)
    updateRegen(world, player, dt)
    drainSp(player, dt, world.time)

    if (player.alive && player.pos.y < world.map.killY) {
      killPlayer(world, player, player.id, { source: 'fall', weaponId: '', at: player.pos })
    }
  }

  updateProjectiles(world, dt)
  updateOrbs(world, dt)
  checkMatchEnd(world)
}

export function leaderboard(world: World): Player[] {
  return [...world.players].sort((a, b) => b.score - a.score)
}

export function aliveEnemiesNear(world: World, player: Player, radius: number): Player[] {
  return world.players.filter(
    (p) => p.alive && p.id !== player.id && dist(player.pos, p.pos) <= radius,
  )
}
