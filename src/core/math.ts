export interface Vec3 {
  x: number
  y: number
  z: number
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const len = (a: Vec3): number => Math.sqrt(dot(a, a))
export const lenXZ = (a: Vec3): number => Math.sqrt(a.x * a.x + a.z * a.z)
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b))
export const distXZ = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

export function norm(a: Vec3): Vec3 {
  const l = len(a)
  return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 }
}

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Frame-rate independent exponential approach. */
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt))
}

export function dampVec3(a: Vec3, b: Vec3, lambda: number, dt: number): Vec3 {
  const t = 1 - Math.exp(-lambda * dt)
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) }
}

/** Move `a` toward `b` by at most `maxDelta`. */
export function moveToward(a: number, b: number, maxDelta: number): number {
  const d = b - a
  if (Math.abs(d) <= maxDelta) return b
  return a + Math.sign(d) * maxDelta
}

export function approachVec3(a: Vec3, target: Vec3, maxDelta: number): Vec3 {
  const d = sub(target, a)
  const l = len(d)
  if (l <= maxDelta || l < 1e-9) return { ...target }
  return add(a, scale(d, maxDelta / l))
}

/** Forward unit vector for a yaw/pitch camera. Pitch is positive looking up. */
export function lookDir(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch)
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp }
}

/** Horizontal forward vector for a yaw. */
export function yawForward(yaw: number): Vec3 {
  return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) }
}

/** Horizontal right vector for a yaw. */
export function yawRight(yaw: number): Vec3 {
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) }
}

export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export interface AABB {
  min: Vec3
  max: Vec3
}

export function aabbFromCenter(center: Vec3, half: Vec3): AABB {
  return {
    min: { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z },
    max: { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z },
  }
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  )
}

export interface RayHit {
  t: number
  normal: Vec3
  index: number
}

/**
 * Ray vs axis-aligned box (slab method). `dir` must be normalised.
 * Returns the entry distance, or null when the ray misses or the box is behind the origin.
 */
export function rayAABB(origin: Vec3, dir: Vec3, box: AABB): RayHit | null {
  let tmin = -Infinity
  let tmax = Infinity
  let axis = 0
  let sign = 1

  const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z']
  for (let i = 0; i < 3; i++) {
    const ax = axes[i]
    const o = origin[ax]
    const d = dir[ax]
    const mn = box.min[ax]
    const mx = box.max[ax]
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return null
      continue
    }
    let t1 = (mn - o) / d
    let t2 = (mx - o) / d
    let s = -1
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
      s = 1
    }
    if (t1 > tmin) {
      tmin = t1
      axis = i
      sign = s
    }
    if (t2 < tmax) tmax = t2
    if (tmin > tmax) return null
  }
  if (tmax < 0) return null
  const t = tmin >= 0 ? tmin : 0
  const normal = v3()
  if (axis === 0) normal.x = sign
  else if (axis === 1) normal.y = sign
  else normal.z = sign
  return { t, normal, index: -1 }
}
