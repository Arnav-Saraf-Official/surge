import { clamp, damp, lenXZ, lookDir, rayAABB, v3, yawForward, yawRight, type Vec3 } from '../core/math'
import { EXPOSED_SPEED } from './damage'
import { terrainHeight } from '../data/maps'
import { CROUCH_HEIGHT, SLIDE_HEIGHT, STAND_HEIGHT, depenetrate, moveAndCollide, playerBox } from './collision'
import type { HideSpotDef } from '../data/types'
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
export const HIDE_HOLD_TIME = 2
const GRAPPLE_REEL_SPEED = 12
const GRAPPLE_BOOST_ACCEL = 72
const GRAPPLE_SIDE_OFFSET = 0.32
const SWING_INPUT_ACCEL = 8

/** Product of `speed` effects from active abilities. */
export function effectSpeedMult(player: Player): number {
  let mult = 1
  for (const e of player.effects) {
    for (const eff of e.effects) if (eff.kind === 'speed') mult *= eff.mult
  }
  return mult
}

/** Closest concealment spot the player is standing in, if any. */
export function nearestHideSpot(
  world: World,
  player: Player,
): { spot: HideSpotDef; index: number; distance: number } | null {
  const hides = world.map.hides
  if (!hides?.length) return null
  let best: { spot: HideSpotDef; index: number; distance: number } | null = null
  for (let i = 0; i < hides.length; i++) {
    const spot = hides[i]
    const distance = Math.hypot(spot.pos[0] - player.pos.x, spot.pos[2] - player.pos.z)
    if (distance > spot.radius) continue
    if (Math.abs(spot.pos[1] - player.pos.y) > 2.6) continue
    if (!best || distance < best.distance) best = { spot, index: i, distance }
  }
  return best
}

/**
 * Concealment: hold the hide key for two seconds inside a spot to enter, then
 * release and hold again for two seconds to leave. While hidden the player is
 * frozen but still damageable, so explosives and shots that reach the spot
 * still hurt.
 */
function updateHide(world: World, player: Player, input: InputCmd, dt: number): void {
  if (player.hiding) {
    const spot = world.map.hides?.[player.hideSpotId]
    if (!input.hide) player.hideExitArmed = true
    if (player.hideExitArmed && input.hide) player.hideProgress += dt / HIDE_HOLD_TIME
    else if (!input.hide) player.hideProgress = 0
    if (player.hideProgress >= 1) {
      const back = player.hideReturnPos ?? v3(spot?.pos[0] ?? player.pos.x, spot?.pos[1] ?? player.pos.y, spot?.pos[2] ?? player.pos.z)
      player.hiding = false
      player.hideProgress = 0
      player.hideExitArmed = false
      player.hideSpotId = -1
      player.hideReturnPos = null
      player.pos = { ...back }
      player.vel = v3()
      world.events.push({ type: 'hide', playerId: player.id, spotId: -1, inside: false })
    }
    return
  }

  const near = input.hide && player.onGround ? nearestHideSpot(world, player) : null
  if (near) {
    player.hideProgress += dt / HIDE_HOLD_TIME
    if (player.hideProgress >= 1) {
      // Reset the meter; the exit timer starts from zero on a fresh hold.
      player.hideProgress = 0
      player.hiding = true
      player.hideSpotId = near.index
      player.hideReturnPos = { ...player.pos }
      player.pos = v3(near.spot.pos[0], near.spot.pos[1], near.spot.pos[2])
      player.vel = v3()
      player.sliding = false
      player.grappling = false
      player.grapples[0].active = false
      player.grapples[1].active = false
      world.events.push({ type: 'hide', playerId: player.id, spotId: near.index, inside: true })
    }
  } else {
    player.hideProgress = Math.max(0, player.hideProgress - dt * 2)
  }
}

/** One movement step. Humans and bots both run through this exact function. */
export function stepMovement(world: World, player: Player, input: InputCmd, dt: number): void {
  const stats = player.stats
  player.yaw = input.yaw
  player.pitch = input.pitch

  // ---- Concealment ---------------------------------------------------
  updateHide(world, player, input, dt)
  if (player.hiding) {
    player.vel = v3()
    player.onGround = true
    player.sliding = false
    player.sprinting = false
    player.crouching = true
    player.height = damp(player.height, CROUCH_HEIGHT, 18, dt)
    player.eyeHeight = damp(player.eyeHeight, 1.15, 18, dt)
    return
  }

  // Rare overlaps (bad spawn, knockback into geometry) would otherwise make
  // every move illegal. Resolve them a few times a second, not every tick.
  if (world.tick % 10 === 0) {
    const free = depenetrate(world.colliders, player.pos, player.height)
    if (free.x !== player.pos.x || free.y !== player.pos.y || free.z !== player.pos.z) {
      player.pos = free
      player.vel = v3()
    }
  }

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
  // Tapping crouch again mid-slide drops the slide into a crouch.
  if (input.slide && input.crouch && player.sliding) {
    player.sliding = false
    player.lastSlideAt = world.time
    player.slideReadyAt = world.time + 0.25
  }

  if (input.slide && player.onGround && !player.sliding && world.time >= player.slideReadyAt && !deployed) {
    const speed = lenXZ(player.vel)
    if (input.sprint || speed > SPRINT_SPEED * 0.6) {
      player.sliding = true
      player.slideTimer = SLIDE_DURATION * stats.slideMult
      // The slide locks onto the direction of travel at the instant it starts.
      const travel = Math.hypot(player.vel.x, player.vel.z)
      const wishTotal = Math.hypot(wishX, wishZ)
      const dirX =
        travel > 0.1 ? player.vel.x / travel : wishTotal > 0.01 ? wishX / wishTotal : -Math.sin(player.yaw)
      const dirZ =
        travel > 0.1 ? player.vel.z / travel : wishTotal > 0.01 ? wishZ / wishTotal : -Math.cos(player.yaw)
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
      // No steering while sliding: the direction chosen at the start holds.
      const s = Math.max(0, speed - 5 * dt)
      const nx = speed > 0.01 ? player.vel.x / speed : 0
      const nz = speed > 0.01 ? player.vel.z / speed : 0
      player.vel.x = nx * s
      player.vel.z = nz * s
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
  // A grounded jump stays available while hooked so landing can tighten the swing.
  if (input.jump && !deployed && (!grappleAttached || player.onGround)) {
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
    } else if (!grappleAttached) {
      // Airborne speed is capped at the same speed this stance gives on the
      // ground: sprinting gives sprint speed, otherwise walk speed.
      const airBase = input.crouch
        ? CROUCH_SPEED
        : input.sprint && !player.aiming && !deployed
          ? SPRINT_SPEED
          : GROUND_SPEED
      const maxAir = airBase * speedMult
      if (hasWish) {
        player.vel.x += wishX * AIR_ACCEL * dt
        player.vel.z += wishZ * AIR_ACCEL * dt
      }
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
  const result = moveAndCollide(
    world.colliders,
    player.pos,
    player.vel,
    dt,
    player.height,
    undefined,
    (x, z) => terrainHeight(world.map, x, z),
  )
  player.pos = result.pos
  player.vel = result.vel
  player.onGround = result.onGround
  if (result.onGround) {
    // Hooks stay latched on landing: the next jump swings from that radius.
    player.jumpsUsed = 0
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

// Small aim cone, walked outward from the crosshair, so a surface the player
// is looking just past still latches instead of needing pixel-perfect aim.
const GRAPPLE_ASSIST: Array<[number, number]> = [
  [0.05, 0],
  [-0.05, 0],
  [0, 0.05],
  [0, -0.05],
  [0.04, 0.04],
  [-0.04, 0.04],
  [0.04, -0.04],
  [-0.04, -0.04],
]

function grappleRayHit(world: World, origin: Vec3, dir: Vec3, maxRange: number): number | null {
  let best: number | null = null
  for (const box of world.colliders) {
    const hit = rayAABB(origin, dir, box)
    if (hit && hit.t > 0.5 && hit.t < maxRange && (best === null || hit.t < best)) best = hit.t
  }
  return best
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
  const maxRange = player.stats.grappleRange
  let dir = aimDir(player)
  let bestT = grappleRayHit(world, origin, dir, maxRange)
  if (bestT === null) {
    for (const [dyaw, dpitch] of GRAPPLE_ASSIST) {
      const candidate = lookDir(player.yaw + dyaw, player.pitch + dpitch)
      const t = grappleRayHit(world, origin, candidate, maxRange)
      if (t !== null) {
        bestT = t
        dir = candidate
        break
      }
    }
  }
  if (bestT === null) {
    world.events.push({ type: 'grapple', playerId: player.id, side, anchor: v3(), attached: false, zip: false })
    return false
  }
  hook.active = true
  hook.anchor = v3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT)
  // Attach at the current distance; the rope only shortens when the player
  // closes the gap themselves.
  hook.length = Math.max(1.5, bestT)
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
  const fwd = yawForward(player.yaw)
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

    // Without boosting the rope holds the tightest radius reached so far, so
    // dropping onto a platform and jumping off keeps that shorter swing.
    if (!boosting && distance < hook.length - 0.05) hook.length = distance

    if (distance >= hook.length - 0.02) {
      const radial = player.vel.x * nx + player.vel.y * ny + player.vel.z * nz
      if (radial < 0) {
        velocityX -= nx * radial * 1.02
        velocityY -= ny * radial * 1.02
        velocityZ -= nz * radial * 1.02
      }
      // Only a stretched rope pulls; a taut one just constrains the circle.
      const stretch = Math.max(0, distance - hook.length)
      const pull = boosting ? GRAPPLE_BOOST_ACCEL : Math.min(48, stretch * 30)
      velocityX += nx * pull * dt
      velocityY += ny * pull * dt
      velocityZ += nz * pull * dt

      // Airborne movement keys feed the swing tangentially instead of adding
      // free air acceleration toward the look direction.
      if (!player.onGround) {
        const wishX = right.x * input.moveX + fwd.x * input.moveZ
        const wishZ = right.z * input.moveX + fwd.z * input.moveZ
        const along = wishX * nx + wishZ * nz
        const tanX = wishX - nx * along
        const tanY = -ny * along
        const tanZ = wishZ - nz * along
        const tanLen = Math.hypot(tanX, tanY, tanZ)
        if (tanLen > 0.001) {
          const gain = (SWING_INPUT_ACCEL * dt) / tanLen
          velocityX += tanX * gain
          velocityY += tanY * gain
          velocityZ += tanZ * gain
        }
      }
    }
    if (distance > player.stats.grappleRange * 1.4) releaseGrapple(world, player, side, false)
  }
  player.vel.x += velocityX
  player.vel.y += velocityY
  player.vel.z += velocityZ
  player.grappleBoosting = boosting && player.grappleBoostFuel > 1e-6
  player.grappling = player.grapples.some((g) => g.active)
}
