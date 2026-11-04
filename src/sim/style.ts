import type { Player, World } from './types'
import { clamp } from '../core/math'

export const SP_MAX = 100
export const SP_STEP = 20
export const SP_STEP_CDR = 0.05
export const SP_MAX_CDR = 0.25
export const FLOURISH_COST = 25
export const OVERCHARGE_COST = 60
export const OVERCHARGE_FILL = 0.5

export type SpReason =
  | 'slideDamage'
  | 'airborneKill'
  | 'doubleJumpHeadshot'
  | 'multikill'
  | 'meleeKill'
  | 'streak'

export const SP_AWARD: Record<SpReason, number> = {
  slideDamage: 5,
  airborneKill: 10,
  doubleJumpHeadshot: 10,
  multikill: 15,
  meleeKill: 10,
  streak: 20,
}

export function awardSp(player: Player, amount: number): void {
  player.sp = clamp(player.sp + amount, 0, SP_MAX)
}

/** Passive cooldown reduction from stored style points. */
export function passiveCdr(player: Player): number {
  return Math.min(SP_MAX_CDR, Math.floor(player.sp / SP_STEP) * SP_STEP_CDR)
}

/** SP bleeds away when you are not fighting. */
export function drainSp(player: Player, dt: number, time: number): void {
  if (time - player.lastCombatAt > 6 && player.sp > 0) {
    player.sp = Math.max(0, player.sp - 2 * dt)
  }
}

export function onPlayerKilled(world: World, victim: Player): void {
  victim.sp = Math.floor(victim.sp * 0.5)
  victim.streak = 0
  void world
}

/** Style points for a confirmed kill. Mutates the killer and returns the total gain. */
export function killSp(
  world: World,
  killer: Player,
  victim: Player,
  opts: { headshot: boolean; source: 'bullet' | 'melee' | 'explosion' },
): number {
  void victim
  let gain = 0
  const airborne = !killer.onGround || killer.grappling
  if (airborne) gain += SP_AWARD.airborneKill
  if (opts.headshot && killer.jumpsUsed > 0 && !killer.onGround) gain += SP_AWARD.doubleJumpHeadshot
  if (opts.source === 'melee') gain += SP_AWARD.meleeKill

  if (world.time - killer.lastKillAt <= 4) {
    killer.multikillCount += 1
    gain += SP_AWARD.multikill * killer.multikillCount
  } else {
    killer.multikillCount = 0
  }
  killer.streak += 1
  if (killer.streak >= 3) gain += SP_AWARD.streak

  awardSp(killer, gain)
  return gain
}
