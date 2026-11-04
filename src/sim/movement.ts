import { clamp, damp, lenXZ, lookDir, rayAABB, v3, yawForward, yawRight } from '../core/math'
import { EXPOSED_SPEED } from './damage'
import { CROUCH_HEIGHT, SLIDE_HEIGHT, STAND_HEIGHT, moveAndCollide, playerBox } from './collision'
import type { InputCmd, Player, World } from './types'

export const GROUND_SPEED = 6
export const SPRINT_SPEED = 8.5
export const CROUCH_SPEED = 3.2
export const SLIDE_SPEED = 10
export const SLIDE_DURATION = 1.2
export const JUMP_HEIGHT = 1.15
export const GRAVITY = 24
export const DOUBLE_JUMP_HEIGHT_SCALE = 0.7
export const AIR_ACCEL = 22
export const TERMINAL_VELOCITY = 60
export const GRAPPLE_BOOST_DURATION = 5
const GRAPPLE_REEL_SPEED = 12
const GRAPPLE_BOOST_ACCEL = 72
const GRAPPLE_SIDE_OFFSET = 0.32

/** Product of `speed` effects from active abilities. */
export function effectSpeedMult(player: Player): number {
  let mult = 1
  for (const e of player.effects) {
    for (const eff of e.effects) if (eff.kind === 'speed') mult *= eff.mult
  }
  return mult
}

/** One movement step. Humans and bots both run through this exact function. */
export function stepMovement(world: World, player: Player, input: InputCmd, dt: number): void {
  const stats = player.stats
  player.yaw = input.yaw
  player.pitch = input.pitch

  const fwd = yawForward(player.yaw)
  const right = yawRight(player.yaw)
  let wishX = right.x * input.moveX + fwd.x * input.moveZ
  let wishZ = right.z * input.moveX + fwd.z * input.moveZ
  const wishLen = Math.hypot(wishX, wishZ)
  if (wishLen > 1) {
    wishX /= wishLen
    wishZ /= wishLen
  }
  const hasWish = wishLen > 0.01
  const speedMult =
    stats.speedMult * effectSpeedMult(player) * (world.time < player.exposedUntil ? EXPOSED_SPEED : 1)
  const deployed = player.deployed

  // ---- Slide ---------------------------------------------------------
  if (input.slide && player.onGround && !player.sliding && world.time >= player.slideReadyAt && !deployed) {
    const speed = lenXZ(player.vel)
    if (input.sprint || speed > SPRINT_SPEED * 0.6) {
      player.sliding = true
      player.slideTimer = SLIDE_DURATION * stats.slideMult
      const dirX = hasWish ? wishX : -Math.sin(player.yaw)
      const dirZ = hasWish ? wishZ : -Math.cos(player.yaw)
      const startSpeed = Math.max(SLIDE_SPEED, speed) * stats.slideMult
      player.vel.x = dirX * startSpeed
      player.vel.z = dirZ * startSpeed
      if (player.vel.y < 0) player.vel.y = 0
    }
  }
  player.lastSlideAt = player.sliding ? world.time : player.lastSlideAt

  if (player.sliding) {
    player.slideTimer -= dt
    const speed = lenXZ(player.vel)
    if (player.slideTimer <= 0 || speed < 3.5 || !player.onGround || deployed) {
      player.sliding = false
      player.lastSlideAt = world.time
      player.slideReadyAt = world.time + 0.25
    } else {
      const s = Math.max(0, speed - 5 * dt)
      const nx = speed > 0.01 ? player.vel.x / speed : 0
      const nz = speed > 0.01 ? player.vel.z / speed : 0
      let dx = nx + (hasWish ? wishX * 6 * dt : 0)
      let dz = nz + (hasWish ? wishZ * 6 * dt : 0)
      const dl = Math.hypot(dx, dz) || 1
      dx /= dl
      dz /= dl
      player.vel.x = dx * s
      player.vel.z = dz * s
      if (player.vel.y < 0) player.vel.y = 0
    }
  }

  // ---- Stance --------------------------------------------------------
  let targetHeight = STAND_HEIGHT
  let targetEye = 1.6
  if (player.sliding) {
    targetHeight = SLIDE_HEIGHT
    targetEye = 0.85
  } else if (input.crouch) {
    targetHeight = CROUCH_HEIGHT
    targetEye = 1.15
  }
  if (targetHeight > player.height) {
    const test = playerBox(player.pos, targetHeight)
    const blocked = world.colliders.some(
      (c) =>
        test.min.x < c.max.x &&
        test.max.x > c.min.x &&
        test.min.y < c.max.y &&
        test.max.y > c.min.y &&
        test.min.z < c.max.z &&
        test.max.z > c.min.z,
    )
    if (blocked) {
      targetHeight = player.height
      targetEye = player.eyeHeight
    }
  }
  player.height = damp(player.height, targetHeight, 18, dt)
  player.eyeHeight = damp(player.eyeHeight, targetEye, 18, dt)
  player.crouching = input.crouch && !player.sliding

  // ---- Jump / double jump -------------------------------------------
  const grappleAttached = player.grapples.some((hook) => hook.active)
  if (input.jump && !deployed && !grappleAttached) {
    if (player.onGround) {
      player.vel.y = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT)
      player.onGround = false
      player.jumpsUsed = 0
      if (player.sliding) {
        player.sliding = false
        player.lastSlideAt = world.time
        player.slideReadyAt = world.time + 0.1
      }
    } else if (player.jumpsUsed < 1) {
      player.vel.y = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT * DOUBLE_JUMP_HEIGHT_SCALE)
      player.jumpsUsed = 1
    }
  }

  // ---- Horizontal acceleration --------------------------------------
  player.aiming = !!input.aim
  const grounded = player.onGround
  player.sprinting = input.sprint && !player.aiming && grounded && !player.sliding && !input.crouch && input.moveZ > 0.15 && !deployed

  if (deployed) {
    player.vel.x = 0
    player.vel.z = 0
  } else if (!player.sliding) {
    const baseSpeed = input.crouch ? CROUCH_SPEED : player.sprinting ? SPRINT_SPEED : GROUND_SPEED
    const targetX = hasWish ? wishX * baseSpeed * speedMult : 0
    const targetZ = hasWish ? wishZ * baseSpeed * speedMult : 0
    if (grounded) {
      player.vel.x = damp(player.vel.x, targetX, hasWish ? 16 : 12, dt)
      player.vel.z = damp(player.vel.z, targetZ, hasWish ? 16 : 12, dt)
    } else {
      const before = Math.hypot(player.vel.x, player.vel.z)
      if (hasWish) {
        player.vel.x += wishX * AIR_ACCEL * dt
        player.vel.z += wishZ * AIR_ACCEL * dt
      }
      const maxAir = Math.max(before, SPRINT_SPEED * speedMult) * 1.15
      const after = Math.hypot(player.vel.x, player.vel.z)
      if (after > maxAir) {
        player.vel.x = (player.vel.x / after) * maxAir
        player.vel.z = (player.vel.z / after) * maxAir
      }
    }
  }

  // ---- Grappling hooks ----------------------------------------------
  applyGrapple(world, player, input, dt)

  // ---- Gravity and integration --------------------------------------
  player.vel.y = Math.max(-TERMINAL_VELOCITY, player.vel.y - GRAVITY * dt)
  const result = moveAndCollide(world.colliders, player.pos, player.vel, dt, player.height)
  player.pos = result.pos
  player.vel = result.vel
  player.onGround = result.onGround
  if (result.onGround) {
    player.jumpsUsed = 0
    player.grapples[0].active = false
    player.grapples[1].active = false
    player.grappling = false
    player.grappleBoosting = false
  }
  player.wasAirborne = !player.onGround

  const maxBound = world.map.bounds ?? 120
  player.pos.x = clamp(player.pos.x, -maxBound, maxBound)
  player.pos.z = clamp(player.pos.z, -maxBound, maxBound)

  // Deployed players can't hold a tripod while airborne.
  if (deployed && !player.onGround) player.deployed = false
}

export function eyePos(player: Player) {
  return v3(player.pos.x, player.pos.y + player.eyeHeight, player.pos.z)
}

export function aimDir(player: Player) {
  return lookDir(player.yaw, player.pitch)
}

/** Fire one grapple. Returns true when it attached to geometry. */
export function fireGrapple(world: World, player: Player, side: 0 | 1): boolean {
  const hook = player.grapples[side]
  if (hook.cooldown > 0 || hook.active) return false
  const right = yawRight(player.yaw)
  const sideOffset = side === 0 ? -GRAPPLE_SIDE_OFFSET : GRAPPLE_SIDE_OFFSET
  const origin = v3(
    player.pos.x + right.x * sideOffset,
    player.pos.y + player.eyeHeight * 0.7,
    player.pos.z + right.z * sideOffset,
  )
  const dir = aimDir(player)
  const maxRange = player.stats.grappleRange
  let bestT = maxRange
  for (const box of world.colliders) {
    const hit = rayAABB(origin, dir, box)
    if (hit && hit.t > 0.5 && hit.t < bestT) bestT = hit.t
  }
  if (bestT >= maxRange) {
    world.events.push({ type: 'grapple', playerId: player.id, side, anchor: v3(), attached: false, zip: false })
    return false
  }
  hook.active = true
  hook.anchor = v3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT)
  hook.length = Math.max(1.5, bestT * 0.95)
  hook.swinging = true
  hook.firedAt = world.time
  player.grappling = true
  player.jumpsUsed = 0
  world.events.push({ type: 'grapple', playerId: player.id, side, anchor: hook.anchor, attached: true, zip: false })
  return true
}

export function releaseGrapple(world: World, player: Player, side: 0 | 1, zip: boolean): void {
  const hook = player.grapples[side]
  if (!hook.active) return
  hook.active = false
  hook.cooldown = player.stats.grappleCd
  if (zip) {
    const d = {
      x: hook.anchor.x - player.pos.x,
      y: hook.anchor.y - player.pos.y,
      z: hook.anchor.z - player.pos.z,
    }
    const l = Math.hypot(d.x, d.y, d.z) || 1
    const pull = 16
    player.vel.x = (d.x / l) * pull
    player.vel.z = (d.z / l) * pull
    player.vel.y = Math.max(player.vel.y, (d.y / l) * pull + 2)
  }
  player.grappling = player.grapples.some((g) => g.active)
  world.events.push({ type: 'grapple', playerId: player.id, side, anchor: hook.anchor, attached: false, zip })
}

function applyGrapple(world: World, player: Player, input: InputCmd, dt: number): void {
  const boosting =
    input.grappleBoost && player.grappleBoostFuel > 0 && player.grapples.some((g) => g.active)
  if (boosting && !player.grappleBoosting) player.vel.y = Math.max(player.vel.y, 10)
  player.grappleBoostFuel = clamp(
    player.grappleBoostFuel + (boosting ? -dt : dt),
    0,
    GRAPPLE_BOOST_DURATION,
  )
  const holds: Array<[0 | 1, boolean]> = [
    [0, input.grappleL],
    [1, input.grappleR],
  ]
  const right = yawRight(player.yaw)
  let velocityX = 0
  let velocityY = 0
  let velocityZ = 0
  for (const [side, held] of holds) {
    const hook = player.grapples[side]
    if (hook.cooldown > 0) hook.cooldown = Math.max(0, hook.cooldown - dt)
    if (hook.active && !held) {
      releaseGrapple(world, player, side, world.time - hook.firedAt < 0.22)
      continue
    }
    if (!hook.active) continue

    const sideOffset = side === 0 ? -GRAPPLE_SIDE_OFFSET : GRAPPLE_SIDE_OFFSET
    if (boosting) hook.length = Math.max(1.5, hook.length - GRAPPLE_REEL_SPEED * dt)
    const toAnchor = {
      x: hook.anchor.x - (player.pos.x + right.x * sideOffset),
      y: hook.anchor.y - (player.pos.y + player.eyeHeight * 0.7),
      z: hook.anchor.z - (player.pos.z + right.z * sideOffset),
    }
    const distance = Math.hypot(toAnchor.x, toAnchor.y, toAnchor.z) || 0.001
    const nx = toAnchor.x / distance
    const ny = toAnchor.y / distance
    const nz = toAnchor.z / distance

    if (distance >= hook.length - 0.02) {
      const radial = player.vel.x * nx + player.vel.y * ny + player.vel.z * nz
      if (radial < 0) {
        velocityX -= nx * radial * 1.02
        velocityY -= ny * radial * 1.02
        velocityZ -= nz * radial * 1.02
      }
      const stretch = Math.max(0, distance - hook.length)
      const pull = boosting ? GRAPPLE_BOOST_ACCEL : Math.min(60, 8 + stretch * 24)
      velocityX += nx * pull * dt
      velocityY += ny * pull * dt
      velocityZ += nz * pull * dt
    }
    if (distance > player.stats.grappleRange * 1.4) releaseGrapple(world, player, side, false)
  }
  player.vel.x += velocityX
  player.vel.y += velocityY
  player.vel.z += velocityZ
  player.grappleBoosting = boosting && player.grappleBoostFuel > 1e-6
  player.grappling = player.grapples.some((g) => g.active)
}
