import { lenXZ, v3 } from '../core/math'
import type { Condition } from '../data/types'
import { weapon as weaponDef } from '../data/weapons'
import { SP_AWARD, awardSp, killSp, onPlayerKilled } from './style'
import type { DamageSource, Player, World } from './types'

export const RESPAWN_TIME = 3
export const EXPOSED_TIME = 5
export const EXPOSED_DAMAGE_TAKEN = 1.25
export const EXPOSED_SPEED = 0.8
const NORMAL_BULLET_DAMAGE_MULT = 0.8

export interface DamageOpts {
  headshot?: boolean
  /** Katana neck slice, for the kill feed and HUD. */
  neck?: boolean
  source: DamageSource
  weaponId: string
  lethal?: boolean
  /**
   * Lethal powers that miss their condition deal a fraction of max health and
   * can never kill. Expressed as a fraction of the target's max health.
   */
  nonLethalFrac?: number
  at?: ReturnType<typeof v3>
}

export function isExposed(player: Player, time: number): boolean {
  return time < player.exposedUntil
}

/** Find an active lethal window on a player. */
export function activeLethal(player: Player): { condition: Condition; bodyshotMult: number; effectAbilityId: string } | null {
  for (const e of player.effects) {
    for (const eff of e.effects) {
      if (eff.kind === 'lethalShot') {
        return { condition: eff.condition, bodyshotMult: eff.bodyshotMult, effectAbilityId: e.abilityId }
      }
    }
  }
  return null
}

export function activeLethalMelee(player: Player): Condition | null {
  for (const e of player.effects) {
    for (const eff of e.effects) {
      if (eff.kind === 'lethalMelee') return eff.condition
    }
  }
  return null
}

export function applyExposed(world: World, player: Player, extraCooldownWeapon?: string, slot?: 'F' | 'T'): void {
  player.exposedUntil = world.time + EXPOSED_TIME
  if (extraCooldownWeapon && slot) {
    const rt = player.weapons[extraCooldownWeapon]
    if (rt) {
      if (slot === 'F') rt.fCooldown *= 1.5
      else rt.tCooldown *= 1.5
    }
  }
  world.events.push({ type: 'exposed', playerId: player.id, until: player.exposedUntil })
}

/** Product of `dr` effects on a player. */
function damageResistance(player: Player): number {
  let mult = 1
  for (const e of player.effects) {
    for (const eff of e.effects) if (eff.kind === 'dr') mult *= 1 - eff.amount
  }
  return Math.max(0.15, mult)
}

function healOnDamage(world: World, attacker: Player, dealt: number): void {
  for (const e of attacker.effects) {
    for (const eff of e.effects) {
      if (eff.kind === 'healOnDamage' && dealt > 0) {
        const heal = dealt * eff.frac
        attacker.health = Math.min(attacker.stats.maxHealth, attacker.health + heal)
        e.damageDealt += dealt
        world.events.push({ type: 'heal', playerId: attacker.id, amount: heal })
      }
    }
  }
}

/**
 * Central damage entry point. All damage in the game flows through here so that
 * Exposed, resistance, style points and kill accounting stay consistent.
 */
export function applyDamage(
  world: World,
  victim: Player,
  attackerId: number,
  raw: number,
  opts: DamageOpts,
): number {
  if (!victim.alive || world.match.ended) return 0
  if (world.time < victim.invulnerableUntil) return 0
  if (raw <= 0 && !opts.lethal) return 0

  let amount = raw * damageResistance(victim)
  if (opts.source === 'bullet' && !opts.lethal) amount *= NORMAL_BULLET_DAMAGE_MULT
  if (isExposed(victim, world.time)) amount *= EXPOSED_DAMAGE_TAKEN
  if (opts.nonLethalFrac !== undefined) {
    const allowed = Math.min(opts.nonLethalFrac * victim.stats.maxHealth, victim.health - 1)
    amount = Math.min(amount, Math.max(0, allowed))
  }
  if (opts.lethal) amount = Math.max(amount, victim.health)

  const attacker = world.players.find((p) => p.id === attackerId) ?? null
  const dealt = Math.min(victim.health, amount)
  victim.health = Math.max(0, victim.health - amount)
  victim.lastDamageAt = world.time
  victim.lastCombatAt = world.time
  for (const effect of victim.effects) {
    if (effect.effects.some((entry) => entry.kind === 'phantomSight')) {
      effect.visionRestoredUntil = world.time + 1.5
    }
  }

  if (attacker && attacker !== victim) {
    attacker.lastCombatAt = world.time
    healOnDamage(world, attacker, dealt)
    if (opts.weaponId) {
      const chargeNeeded = weaponDef(opts.weaponId).t.charge
      const runtime = attacker.weapons[opts.weaponId]
      if (chargeNeeded && runtime) {
        runtime.tCharge = Math.min(
          chargeNeeded,
          runtime.tCharge + dealt * attacker.stats.tChargeMult,
        )
      }
    }
    if (attacker.sliding || world.time - attacker.lastSlideAt <= 1) awardSp(attacker, SP_AWARD.slideDamage)
  }

  world.events.push({
    type: 'damage',
    playerId: victim.id,
    amount: dealt,
    fromId: attackerId,
    source: opts.source,
  })

  if (victim.health <= 0) {
    killPlayer(world, victim, attackerId, opts)
  } else {
    world.events.push({
      type: 'hit',
      playerId: attackerId,
      targetId: victim.id,
      damage: dealt,
      headshot: !!opts.headshot,
      neck: !!opts.neck,
      lethal: !!opts.lethal,
      at: opts.at ?? v3(victim.pos.x, victim.pos.y + 1.2, victim.pos.z),
    })
  }
  return dealt
}

export function killPlayer(world: World, victim: Player, killerId: number, opts: DamageOpts): void {
  victim.alive = false
  victim.health = 0
  victim.deaths += 1
  victim.respawnAt = world.time + RESPAWN_TIME
  victim.sliding = false
  victim.hiding = false
  victim.hideSpotId = -1
  victim.hideProgress = 0
  victim.hideExitArmed = false
  victim.hideReturnPos = null
  victim.deployed = false
  victim.effects = []
  victim.deflectUntil = 0
  victim.deflectCharges = 0
  victim.grapples[0].active = false
  victim.grapples[1].active = false
  victim.grappling = false
  victim.grappleBoosting = false
  victim.invisibility = 0
  victim.markedUntil = 0
  victim.revealUntil = 0
  victim.revealRadius = 0
  onPlayerKilled(world, victim)

  const killer = world.players.find((p) => p.id === killerId) ?? null
  let spGain = 0
  if (killer && killer.id !== victim.id) {
    killer.kills += 1
    killer.score += 1
    killer.lastKillAt = world.time
    spGain = killSp(world, killer, victim, {
      headshot: !!opts.headshot,
      source: opts.source === 'melee' ? 'melee' : opts.source === 'explosion' ? 'explosion' : 'bullet',
    })
    // Awarded kills are credited to the active ability window (lethal powers).
    for (const e of killer.effects) {
      if (!opts.lethal || e.weaponId !== opts.weaponId) continue
      const lethal = e.effects.some((eff) => eff.kind === 'lethalShot' || eff.kind === 'lethalMelee')
      if (!lethal) continue
      e.kills += 1
      if (e.kills === 1) {
        const runtime = killer.weapons[e.weaponId]
        if (runtime) runtime.tCooldown *= 0.5
      }
    }
  }

  // Small regeneration orb at the victim's position.
  world.orbs.push({
    id: world.nextEntityId++,
    pos: v3(victim.pos.x, victim.pos.y + 0.6, victim.pos.z),
    amount: 10,
    respawnAt: world.time + 8,
    active: true,
    temporary: true,
  })

  world.events.push({
    type: 'kill',
    killerId,
    victimId: victim.id,
    weaponId: opts.weaponId,
    headshot: !!opts.headshot,
    neck: !!opts.neck,
    lethal: !!opts.lethal,
    spGain,
  })
  world.events.push({ type: 'death', playerId: victim.id })
}

/** Out-of-combat regeneration, per the 10 s / 10 hp-per-second rule. */
export function updateRegen(world: World, player: Player, dt: number): void {
  if (!player.alive) return
  if (world.time - player.lastDamageAt < 10) return
  if (player.health >= player.stats.maxHealth) return
  player.health = Math.min(player.stats.maxHealth, player.health + 10 * dt)
}

export function regenSpeed(player: Player): number {
  return lenXZ(player.vel)
}
