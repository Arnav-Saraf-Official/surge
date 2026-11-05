import type { AbilityDef, Effect } from '../data/types'
import { weapon as weaponDef } from '../data/weapons'
import { applyDamage, applyExposed } from './damage'
import { moveAndCollide } from './collision'
import { FLOURISH_COST, OVERCHARGE_COST, OVERCHARGE_FILL } from './style'
import type { ActiveEffect, Player, World } from './types'
import { hasEffect } from './effects'
import { v3 } from '../core/math'

export const DEPLOY_TRANSITION = 2
export const PIERCE_SHOTS = 6

const PHANTOM_SIGHT: AbilityDef = {
  id: 'phantomSight',
  name: 'Phantom Sight',
  slot: 'T',
  tags: ['Offense', 'Utility'],
  cooldown: 90,
  charge: 1300,
  duration: 8,
  lethal: 'H',
  effects: [
    { kind: 'phantomSight' },
    { kind: 'pierce', extraWalls: 6 },
    { kind: 'lethalShot', condition: 'H', bodyshotMult: 0.75 },
  ],
  notes: 'Blackout vision reveals enemies within 60 m; four wall-penetrating shots.',
}

function hasPhantomLoadout(player: Player): boolean {
  return player.loadout.slots.includes('ghostline') && player.loadout.slots.includes('katana')
}

export function abilityForSlot(player: Player, slot: 'F' | 'T'): AbilityDef | null {
  const id = player.loadout.slots[player.slot]
  if (!id) return null
  if (slot === 'T' && id === 'ghostline' && hasPhantomLoadout(player)) return PHANTOM_SIGHT
  const weapon = weaponDef(id)
  return slot === 'F' ? weapon.f : weapon.t
}

function makeEffect(ability: AbilityDef, weaponId: string, duration: number, now: number): ActiveEffect {
  const shots = ability.effects.some((e) => e.kind === 'phantomSight')
    ? 4
    : ability.effects.some((e) => e.kind === 'pierce')
    ? PIERCE_SHOTS
    : ability.effects.some((e) => e.kind === 'guided' || e.kind === 'cluster')
      ? 1
      : ability.effects.some((e) => e.kind === 'nextShot')
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
  const rt = player.weapons[id]
  if (!rt) return null
  const ability = abilityForSlot(player, slot)
  if (!ability) return null
  const chargeNeeded = ability.charge ?? 0
  const pendingQuickScope =
    slot === 'F' &&
    ability.effects.some((effect) => effect.kind === 'quickScope') &&
    player.effects.some((effect) => effect.abilityId === ability.id)
  const ready =
    slot === 'F'
      ? rt.fCooldown <= 0 && world.time >= player.exposedUntil && !pendingQuickScope
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
  const rt = player.weapons[id]
  if (!rt) return false
  const ability = abilityForSlot(player, slot)
  if (!ability) return false
  const phantom = player.effects.find((effect) =>
    effect.effects.some((entry) => entry.kind === 'phantomSight'),
  )

  if (slot === 'F') {
    if (world.time < player.exposedUntil) return false
    const pendingQuickScope =
      ability.effects.some((effect) => effect.kind === 'quickScope') &&
      player.effects.some((effect) => effect.abilityId === ability.id)
    if (rt.fCooldown > 0 || pendingQuickScope) return false
  } else {
    const ready = rt.tCooldown <= 0 || (ability.charge !== undefined && rt.tCharge >= ability.charge)
    if (!ready) return false
  }
  if (slot === 'F' && id === 'katana' && phantom) {
    if (phantom.phantomDashUsed) return false
    phantom.phantomDashUsed = true
  }

  // Tripod is a toggle with no cooldown.
  if (ability.effects.some((e) => e.kind === 'deploy')) {
    player.deployed = !player.deployed
    rt.deployed = player.deployed
    rt.deployEndsAt = world.time + DEPLOY_TRANSITION
    world.events.push({ type: 'ability', playerId: player.id, abilityId: ability.id, name: ability.name, slot })
    return true
  }

  const cooldownOnHeadshot = ability.effects.some((effect) => effect.kind === 'quickScope')
  if (slot === 'F') {
    if (!cooldownOnHeadshot) rt.fCooldown = ability.cooldown * (1 - player.stats.cdr)
  } else {
    rt.tCooldown = ability.cooldown * (1 - player.stats.cdr)
    rt.tCharge = 0
  }

  for (const eff of ability.effects) applyInstant(world, player, eff)

  if (ability.duration > 0) {
    const effect = makeEffect(ability, id, ability.duration, world.time)
    player.effects.push(effect)
    if (ability.effects.some((e) => e.kind === 'reveal')) {
      player.revealUntil = Math.max(player.revealUntil, effect.endsAt)
      player.revealRadius = Math.max(
        player.revealRadius,
        ...ability.effects.flatMap((e) => (e.kind === 'reveal' ? [e.radius] : [])),
      )
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
    case 'shotgunSwing': {
      const weaponId = player.loadout.slots[player.slot]
      if (!weaponId) break
      const weapon = weaponDef(weaponId)
      const damage = weapon.fire.damage * weapon.fire.pellets * eff.damageFraction
      for (const target of world.players) {
        if (!target.alive || target.id === player.id) continue
        const dx = target.pos.x - player.pos.x
        const dz = target.pos.z - player.pos.z
        const distance = Math.hypot(dx, dz)
        if (distance > eff.radius) continue
        applyDamage(world, target, player.id, damage, {
          source: 'ability',
          weaponId,
          at: v3(target.pos.x, target.pos.y + target.height * 0.5, target.pos.z),
        })
        if (distance > 0.01) {
          const force = 6 * (1 - distance / eff.radius)
          target.vel.x += (dx / distance) * force
          target.vel.z += (dz / distance) * force
          target.vel.y = Math.max(target.vel.y, 1.5 * force)
        }
      }
      break
    }
    case 'slowTargets': {
      for (const target of world.players) {
        const distance = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z)
        if (!target.alive || target.id === player.id || distance > eff.radius) continue
        target.effects.push({
          abilityId: `slow-${player.id}-${world.tick}`,
          abilityName: 'Shockwave',
          weaponId: player.loadout.slots[player.slot] ?? '',
          slot: 'F',
          effects: [{ kind: 'speed', mult: eff.mult }],
          duration: eff.duration,
          endsAt: world.time + eff.duration,
          lethal: undefined,
          kills: 0,
          damageDealt: 0,
          shotsLeft: Infinity,
        })
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
  if (world.time >= player.revealUntil) {
    player.revealUntil = 0
    player.revealRadius = 0
  }
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
