import type { AbilityDef, Effect } from '../data/types'
import { weapon as weaponDef } from '../data/weapons'
import { applyExposed } from './damage'
import { moveAndCollide } from './collision'
import { FLOURISH_COST, OVERCHARGE_COST, OVERCHARGE_FILL } from './style'
import type { ActiveEffect, Player, World } from './types'
import { hasEffect } from './effects'
import { v3 } from '../core/math'

export const DEPLOY_TRANSITION = 2
export const PIERCE_SHOTS = 6

function makeEffect(ability: AbilityDef, weaponId: string, duration: number, now: number): ActiveEffect {
  const shots = ability.effects.some((e) => e.kind === 'pierce')
    ? PIERCE_SHOTS
    : ability.effects.some((e) => e.kind === 'guided' || e.kind === 'cluster')
      ? 1
      : Infinity
  return {
    abilityId: ability.id,
    abilityName: ability.name,
    weaponId,
    slot: ability.slot,
    effects: ability.effects,
    duration,
    endsAt: now + duration,
    lethal: ability.lethal,
    kills: 0,
    damageDealt: 0,
    shotsLeft: shots,
  }
}

export interface AbilityStatus {
  ready: boolean
  cooldownRemaining: number
  charge: number
  chargeNeeded: number
  lethal: boolean
}

export function abilityStatus(world: World, player: Player, slot: 'F' | 'T'): AbilityStatus | null {
  const id = player.loadout.slots[player.slot]
  if (!id) return null
  const def = weaponDef(id)
  const rt = player.weapons[id]
  const ability = slot === 'F' ? def.f : def.t
  const chargeNeeded = ability.charge ?? 0
  const ready =
    slot === 'F'
      ? rt.fCooldown <= 0 && world.time >= player.exposedUntil
      : rt.tCooldown <= 0 || (chargeNeeded > 0 && rt.tCharge >= chargeNeeded)
  return {
    ready,
    cooldownRemaining: slot === 'F' ? rt.fCooldown : rt.tCooldown,
    charge: rt.tCharge,
    chargeNeeded,
    lethal: !!ability.lethal,
  }
}

/** True when the player is inside a lethal window right now. */
export function isLethalWindow(player: Player): boolean {
  return player.effects.some((e) => !!e.lethal && e.kills === 0)
}

export function useAbility(world: World, player: Player, slot: 'F' | 'T'): boolean {
  const id = player.loadout.slots[player.slot]
  if (!id) return false
  const def = weaponDef(id)
  const rt = player.weapons[id]
  if (!rt) return false
  const ability = slot === 'F' ? def.f : def.t

  if (slot === 'F') {
    if (world.time < player.exposedUntil) return false
    if (rt.fCooldown > 0) return false
  } else {
    const ready = rt.tCooldown <= 0 || (ability.charge !== undefined && rt.tCharge >= ability.charge)
    if (!ready) return false
  }

  // Tripod is a toggle with no cooldown.
  if (ability.effects.some((e) => e.kind === 'deploy')) {
    player.deployed = !player.deployed
    rt.deployed = player.deployed
    rt.deployEndsAt = world.time + DEPLOY_TRANSITION
    world.events.push({ type: 'ability', playerId: player.id, abilityId: ability.id, name: ability.name, slot })
    return true
  }

  if (slot === 'F') rt.fCooldown = ability.cooldown * (1 - player.stats.cdr)
  else {
    rt.tCooldown = ability.cooldown * (1 - player.stats.cdr)
    rt.tCharge = 0
  }

  for (const eff of ability.effects) applyInstant(world, player, eff)

  if (ability.duration > 0) {
    const effect = makeEffect(ability, id, ability.duration, world.time)
    player.effects.push(effect)
    if (ability.effects.some((e) => e.kind === 'reveal')) {
      player.revealUntil = Math.max(player.revealUntil, effect.endsAt)
    }
  }

  world.events.push({ type: 'ability', playerId: player.id, abilityId: ability.id, name: ability.name, slot })
  return true
}

function applyInstant(world: World, player: Player, eff: Effect): void {
  switch (eff.kind) {
    case 'dash': {
      const dx = -Math.sin(player.yaw)
      const dz = -Math.cos(player.yaw)
      const steps = 12
      const per = eff.distance / steps
      for (let i = 0; i < steps; i++) {
        const stepVel = v3((dx * per) / (1 / 60), player.vel.y, (dz * per) / (1 / 60))
        const res = moveAndCollide(world.colliders, player.pos, stepVel, 1 / 60, player.height, 0.35)
        player.pos = res.pos
        if (res.hitXZ) break
      }
      player.vel.y = Math.max(player.vel.y, 0)
      break
    }
    case 'knockback': {
      for (const p of world.players) {
        if (!p.alive || p.id === player.id) continue
        const dx = p.pos.x - player.pos.x
        const dz = p.pos.z - player.pos.z
        const d = Math.hypot(dx, dz)
        if (d > eff.radius || d < 0.01) continue
        const falloff = 1 - d / eff.radius
        p.vel.x += (dx / d) * eff.force * falloff
        p.vel.z += (dz / d) * eff.force * falloff
        p.vel.y = Math.max(p.vel.y, 4 * falloff)
        world.events.push({ type: 'knockback', playerId: p.id, from: v3(player.pos.x, player.pos.y, player.pos.z) })
      }
      break
    }
    default:
      break
  }
}

/** Advance ability windows, expiring them and applying Lethal Strain. */
export function updateEffects(world: World, player: Player, dt: number): void {
  const expired: ActiveEffect[] = []
  for (const e of player.effects) {
    if (world.time >= e.endsAt) {
      expired.push(e)
      continue
    }
    for (const eff of e.effects) {
      if (eff.kind === 'healOverTime' && e.duration > 0) {
        const heal = (eff.total / e.duration) * dt
        player.health = Math.min(player.stats.maxHealth, player.health + heal)
      }
    }
  }

  for (const e of expired) {
    if (e.lethal && e.kills === 0) applyExposed(world, player, e.weaponId, 'T')
    world.events.push({ type: 'abilityEnd', playerId: player.id, abilityId: e.abilityId })
  }
  if (expired.length) player.effects = player.effects.filter((e) => !expired.includes(e))

  player.invisibility = hasEffect(player, 'invisible') ? 1 : 0
}

/** Spend style points: Flourish resets F, Overcharge fills half of the T charge. */
export function spendStyle(world: World, player: Player, mode: 'flourish' | 'overcharge'): boolean {
  const id = player.loadout.slots[player.slot]
  if (!id) return false
  const rt = player.weapons[id]
  const def = weaponDef(id)
  if (mode === 'flourish') {
    if (player.sp < FLOURISH_COST || rt.fCooldown <= 0) return false
    player.sp -= FLOURISH_COST
    rt.fCooldown = 0
    world.events.push({ type: 'ability', playerId: player.id, abilityId: 'flourish', name: 'Flourish', slot: 'F' })
    return true
  }
  const needed = def.t.charge ?? 0
  if (player.sp < OVERCHARGE_COST || needed <= 0) return false
  player.sp -= OVERCHARGE_COST
  rt.tCharge = Math.min(needed, rt.tCharge + needed * OVERCHARGE_FILL)
  world.events.push({ type: 'ability', playerId: player.id, abilityId: 'overcharge', name: 'Overcharge', slot: 'T' })
  return true
}
