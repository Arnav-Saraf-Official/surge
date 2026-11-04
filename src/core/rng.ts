/** Deterministic 32-bit PRNG (mulberry32) so bot behaviour and matches can be replayed. */
export class Rng {
  private state: number

  constructor(seed = 1337) {
    this.state = seed >>> 0
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  int(minInclusive: number, maxExclusive: number): number {
    return Math.floor(this.range(minInclusive, maxExclusive))
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length)]
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  /** Uniform point in a cone of half-angle `spread` around a unit direction. */
  spreadDir(dir: { x: number; y: number; z: number }, spread: number): { x: number; y: number; z: number } {
    if (spread <= 0) return { ...dir }
    const u = this.next() * Math.PI * 2
    const r = Math.sqrt(this.next()) * Math.tan(spread)
    // Build an orthonormal basis around dir.
    const up = Math.abs(dir.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
    let rx = up.y * dir.z - up.z * dir.y
    let ry = up.z * dir.x - up.x * dir.z
    let rz = up.x * dir.y - up.y * dir.x
    const rl = Math.hypot(rx, ry, rz) || 1
    rx /= rl
    ry /= rl
    rz /= rl
    const ux = dir.y * rz - dir.z * ry
    const uy = dir.z * rx - dir.x * rz
    const uz = dir.x * ry - dir.y * rx
    const cu = Math.cos(u) * r
    const su = Math.sin(u) * r
    const x = dir.x + rx * cu + ux * su
    const y = dir.y + ry * cu + uy * su
    const z = dir.z + rz * cu + uz * su
    const l = Math.hypot(x, y, z) || 1
    return { x: x / l, y: y / l, z: z / l }
  }
}

export const rng = new Rng(1)
