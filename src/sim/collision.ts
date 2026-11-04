import type { AABB, RayHit, Vec3 } from '../core/math'
import { aabbOverlap, rayAABB, v3 } from '../core/math'

/** Player capsule/box dimensions. The sim uses boxes for cheap deterministic collision. */
export const PLAYER_RADIUS = 0.4
export const STAND_HEIGHT = 1.8
export const CROUCH_HEIGHT = 1.25
export const SLIDE_HEIGHT = 1.0
export const STEP_HEIGHT = 0.6

export function playerBox(pos: Vec3, height: number): AABB {
  return {
    min: { x: pos.x - PLAYER_RADIUS, y: pos.y, z: pos.z - PLAYER_RADIUS },
    max: { x: pos.x + PLAYER_RADIUS, y: pos.y + height, z: pos.z + PLAYER_RADIUS },
  }
}

function overlapsAny(colliders: AABB[], box: AABB): boolean {
  for (let i = 0; i < colliders.length; i++) {
    if (aabbOverlap(box, colliders[i])) return true
  }
  return false
}

export function pointBlocked(colliders: AABB[], p: Vec3): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i]
    if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) {
      return true
    }
  }
  return false
}

export interface MoveResult {
  pos: Vec3
  vel: Vec3
  onGround: boolean
  hitXZ: boolean
}

/**
 * Axis-separated kinematic move with auto step-up. Mutates nothing; returns the
 * resolved position and velocity. Deterministic and cheap enough for 60 Hz.
 */
export function moveAndCollide(
  colliders: AABB[],
  pos: Vec3,
  vel: Vec3,
  dt: number,
  height: number,
  stepHeight = STEP_HEIGHT,
): MoveResult {
  const out: Vec3 = { x: pos.x, y: pos.y, z: pos.z }
  const v: Vec3 = { x: vel.x, y: vel.y, z: vel.z }
  let hitXZ = false

  // Horizontal: X then Z, with step-up when grounded.
  const tryStep = (axis: 'x' | 'z', candidate: number): boolean => {
    const test = { x: out.x, y: out.y, z: out.z }
    test[axis] = candidate
    if (!overlapsAny(colliders, playerBox(test, height))) {
      out[axis] = candidate
      return true
    }
    // Step up onto low geometry (stairs, ledges).
    if (stepHeight > 0) {
      const raised = { x: out.x, y: out.y + stepHeight, z: out.z }
      raised[axis] = candidate
      if (!overlapsAny(colliders, playerBox(raised, height))) {
        out[axis] = candidate
        out.y += stepHeight
        return true
      }
    }
    return false
  }

  const nextX = out.x + v.x * dt
  if (!tryStep('x', nextX)) {
    v.x = 0
    hitXZ = true
  }
  const nextZ = out.z + v.z * dt
  if (!tryStep('z', nextZ)) {
    v.z = 0
    hitXZ = true
  }

  // Vertical.
  const nextY = out.y + v.y * dt
  const testBox = playerBox({ x: out.x, y: nextY, z: out.z }, height)
  let landed = false
  if (overlapsAny(colliders, testBox)) {
    if (v.y <= 0) {
      // Snap to the highest surface we are intersecting.
      let top = -Infinity
      for (const c of colliders) {
        if (aabbOverlap(testBox, c) && c.max.y <= out.y + 0.001 + Math.abs(v.y * dt) + 0.001) {
          top = Math.max(top, c.max.y)
        }
      }
      if (top === -Infinity) {
        for (const c of colliders) {
          if (aabbOverlap(testBox, c)) top = Math.max(top, c.max.y)
        }
      }
      out.y = Math.max(0, top)
      v.y = 0
      landed = true
    } else {
      let bottom = Infinity
      for (const c of colliders) {
        if (aabbOverlap(testBox, c)) bottom = Math.min(bottom, c.min.y)
      }
      out.y = bottom - height - 0.001
      v.y = 0
    }
  } else {
    out.y = nextY
  }

  return { pos: out, vel: v, onGround: landed, hitXZ }
}

/** Nearest world hit along a ray, or null. `dir` must be normalised. */
export function raycastWorld(
  colliders: AABB[],
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
): (RayHit & { point: Vec3 }) | null {
  let best: RayHit | null = null
  for (let i = 0; i < colliders.length; i++) {
    const hit = rayAABB(origin, dir, colliders[i])
    if (hit && hit.t <= maxDist && (!best || hit.t < best.t)) {
      best = { ...hit, index: i }
    }
  }
  if (!best) return null
  return { ...best, point: { x: origin.x + dir.x * best.t, y: origin.y + dir.y * best.t, z: origin.z + dir.z * best.t } }
}

/** All world hits along a ray, sorted near to far. Used for wall penetration. */
export function raycastWorldAll(
  colliders: AABB[],
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
): Array<RayHit & { point: Vec3 }> {
  const hits: Array<RayHit & { point: Vec3 }> = []
  for (let i = 0; i < colliders.length; i++) {
    const hit = rayAABB(origin, dir, colliders[i])
    if (hit && hit.t > 0.01 && hit.t <= maxDist) {
      hits.push({
        ...hit,
        index: i,
        point: { x: origin.x + dir.x * hit.t, y: origin.y + dir.y * hit.t, z: origin.z + dir.z * hit.t },
      })
    }
  }
  hits.sort((a, b) => a.t - b.t)
  return hits
}

export function segmentBlocked(colliders: AABB[], from: Vec3, to: Vec3): boolean {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }
  const l = Math.hypot(d.x, d.y, d.z)
  if (l < 1e-6) return false
  const dir = { x: d.x / l, y: d.y / l, z: d.z / l }
  return raycastWorld(colliders, from, dir, l) !== null
}

/**
 * Slide a point out of any geometry. Used to validate spawns and dashes.
 */
export function safePoint(colliders: AABB[], p: Vec3, height: number): Vec3 {
  if (!overlapsAny(colliders, playerBox(p, height))) return { ...p }
  for (let i = 1; i <= 20; i++) {
    const up = v3(p.x, p.y + i * 0.25, p.z)
    if (!overlapsAny(colliders, playerBox(up, height))) return up
  }
  return { ...p }
}
