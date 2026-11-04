import { angleDelta, clamp, dist, v3, yawForward } from '../core/math'
import { weapon as weaponDef } from '../data/weapons'
import { abilityStatus, useAbility } from './abilities'
import { segmentBlocked } from './collision'
import { eyePos } from './movement'
import { emptyInput } from './types'
import type { InputCmd, Player, World } from './types'

export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'elite'

export const BOT_SKILL: Record<BotDifficulty, number> = {
  easy: 0.25,
  normal: 0.5,
  hard: 0.75,
  elite: 0.92,
}

/** Preferred engagement distance per weapon mode. */
const PREFERRED_RANGE: Record<string, number> = {
  melee: 1.8,
  shotgun: 5,
  sniper: 32,
  explosive: 22,
  rifle: 16,
  auto: 12,
  pistol: 11,
}

function visible(world: World, from: Player, to: Player): boolean {
  return !segmentBlocked(world.colliders, eyePos(from), eyePos(to))
}

function chooseTarget(world: World, bot: Player): Player | null {
  let best: Player | null = null
  let bestDist = Infinity
  for (const p of world.players) {
    if (!p.alive || p.id === bot.id) continue
    // Invisible players are only spotted inside the shimmer radius.
    if (p.invisibility > 0) {
      const d = dist(bot.pos, p.pos)
      if (d > 5) continue
    }
    if (!visible(world, bot, p)) continue
    const d = dist(bot.pos, p.pos)
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return best
}

/**
 * Utility-ish bot brain. Produces the same InputCmd a human produces, so bots
 * obey identical movement, cooldown and lethal rules.
 */
export function botInput(world: World, bot: Player): InputCmd {
  const input = emptyInput()
  const brain = bot.botBrain
  if (!brain) return input
  const skill = clamp(bot.botSkill, 0, 1)
  const weaponId = bot.loadout.slots[bot.slot]
  const def = weaponId ? weaponDef(weaponId) : null
  const mode = def?.fire.mode ?? 'rifle'

  if (world.time >= brain.nextDecisionAt) {
    brain.nextDecisionAt = world.time + 0.25
    const target = chooseTarget(world, bot)
    brain.targetId = target?.id ?? -1
    if (world.rng.next() < 0.25) brain.strafe *= -1
    if (world.rng.next() < (1 - skill) * 0.5) brain.strafe *= -1
    if (world.time >= brain.nextWanderAt) {
      brain.nextWanderAt = world.time + 3
      const angle = world.rng.next() * Math.PI * 2
      const r = 8 + world.rng.next() * 16
      brain.wanderX = bot.pos.x + Math.cos(angle) * r
      brain.wanderZ = bot.pos.z + Math.sin(angle) * r
    }
  }

  const target = world.players.find((p) => p.id === brain.targetId && p.alive) ?? null

  if (target) {
    const aimPoint = v3(target.pos.x, target.pos.y + target.height * 0.55, target.pos.z)
    const eye = eyePos(bot)
    const dx = aimPoint.x - eye.x
    const dy = aimPoint.y - eye.y
    const dz = aimPoint.z - eye.z
    const horizontal = Math.hypot(dx, dz)
    const desiredYaw = Math.atan2(-dx, -dz)
    const desiredPitch = Math.atan2(dy, horizontal)

    // Reaction and aim error scale inversely with skill.
    const errorScale = (1 - skill) * 0.1
    const jitterY = (world.rng.next() - 0.5) * errorScale
    const jitterP = (world.rng.next() - 0.5) * errorScale * 0.6
    const turnRate = 2 + skill * 9
    brain.aimYaw += angleDelta(brain.aimYaw, desiredYaw + jitterY) * Math.min(1, turnRate * (1 / 60))
    brain.aimPitch += angleDelta(brain.aimPitch, desiredPitch + jitterP) * Math.min(1, turnRate * (1 / 60))

    input.yaw = brain.aimYaw
    input.pitch = clamp(brain.aimPitch, -1.4, 1.4)

    const range = dist(bot.pos, target.pos)
    const preferred = PREFERRED_RANGE[mode] ?? 14
    const forward = range > preferred * 1.2 ? 1 : range < preferred * 0.7 ? -0.6 : 0
    input.moveZ = forward
    input.moveX = brain.strafe * 0.85
    input.sprint = forward > 0 && range > preferred * 1.6

    // Fire when the aim is roughly aligned and the line is clear.
    const aligned = Math.abs(angleDelta(brain.aimYaw, desiredYaw)) < 0.035 + (1 - skill) * 0.06
    input.aim = (aligned || range > 10) && mode !== 'melee' && skill > 0.35
    input.fire = aligned && range < (def?.fire.range ?? 90) && !segmentBlocked(world.colliders, eye, aimPoint)
    input.melee = mode === 'melee' && range < 2.4 && aligned

    // Slide to close distance, jump to break lines.
    if (world.time >= brain.nextJumpAt) {
      if (world.rng.next() < 0.02 * skill) {
        input.jump = true
        brain.nextJumpAt = world.time + 1.5
      } else if (input.sprint && world.rng.next() < 0.05 * skill) {
        input.slide = true
        brain.nextJumpAt = world.time + 2
      }
    }

    // Abilities: F for utility, T only when it can actually connect.
    if (world.rng.next() < 0.02 + skill * 0.04) {
      const status = abilityStatus(world, bot, 'F')
      if (status?.ready) input.abilityF = true
    }
    if (world.rng.next() < 0.02 + skill * 0.05 && range < 45) {
      const status = abilityStatus(world, bot, 'T')
      if (status?.ready) input.abilityT = true
    }

    // Reload when dry and not being pushed.
    const rt = weaponId ? bot.weapons[weaponId] : null
    if (rt && def && def.fire.magazine > 0 && rt.ammo <= 0) input.reload = true
  } else {
    // Wander toward a point, hunting orbs on the way.
    const orb = world.orbs.filter((o) => o.active).sort((a, b) => dist(bot.pos, a.pos) - dist(bot.pos, b.pos))[0]
    const goal = orb ? orb.pos : v3(brain.wanderX, bot.pos.y, brain.wanderZ)
    const dx = goal.x - bot.pos.x
    const dz = goal.z - bot.pos.z
    const desiredYaw = Math.atan2(-dx, -dz)
    brain.aimYaw += angleDelta(brain.aimYaw, desiredYaw) * 0.15
    brain.aimPitch *= 0.9
    input.yaw = brain.aimYaw
    input.pitch = brain.aimPitch
    input.moveZ = 1
    input.sprint = true
    brain.strafe = 0
  }

  // Unstick: if we want to move but aren't, hop.
  const speed = Math.hypot(bot.vel.x, bot.vel.z)
  if (input.moveZ !== 0 && speed < 0.6) {
    brain.stuckTime += 1 / 60
    if (brain.stuckTime > 0.35) {
      input.jump = true
      brain.stuckTime = 0
      brain.strafe = -brain.strafe
    }
  } else {
    brain.stuckTime = 0
  }

  void yawForward
  return input
}

/** Convenience for tests and the smoke script: run a bot ability directly. */
export function botTryAbility(world: World, bot: Player, slot: 'F' | 'T'): boolean {
  return useAbility(world, bot, slot)
}
