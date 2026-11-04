import { dist, lenXZ, rayAABB, v3, yawForward } from '../core/math'
import type { WeaponDef } from '../data/types'
import { weapon as weaponDef } from '../data/weapons'
import { playerBox, raycastWorld, raycastWorldAll } from './collision'
import { activeLethal, activeLethalMelee, applyDamage } from './damage'
import { effectMult } from './effects'
import { SPRINT_SPEED, aimDir, eyePos } from './movement'
import { passiveCdr } from './style'
import type { Player, Projectile, World } from './types'

export const LETHAL_PELLET_RANGE = 4
export const WALL_DAMAGE_MIN = 0.1

/**
 * Wall penetration table from the design doc. Returns the fraction of the
 * target's max health dealt, or a "leave at" fraction for 5+ walls.
 */
export function wallDamage(walls: number, headshot: boolean): { fraction: number; leaveAt?: number } {
  const table: Array<[number, number]> = [
    [2, 0.9],
    [1.7, 0.85],
    [1.4, 0.8],
    [1.15, 0.75],
    [1, 0.7],
  ]
  if (walls >= 5) return { fraction: 0, leaveAt: headshot ? 0.1 : 0.3 }
  const [head, body] = table[walls]
  return { fraction: headshot ? head : body }
}

function pierceAllowance(player: Player): number {
  let extra = 0
  for (const e of player.effects) {
    for (const eff of e.effects) if (eff.kind === 'pierce') extra += eff.extraWalls
  }
  return extra
}

export function currentSpread(player: Player, def: WeaponDef): number {
  let spread = def.fire.spread
  const speed = lenXZ(player.vel)
  if (player.aiming) {
    spread *= 0.25
  } else {
    if (speed > 0.5 && !player.sliding) spread *= 1 + (speed / SPRINT_SPEED) * 2.2
    if (!player.onGround) spread *= 1.8
    if (player.sliding) spread *= 1.3
  }
  if (player.deployed) spread *= 0.06
  spread *= effectMult(player, 'accuracy')
  return spread
}

export function fireInterval(player: Player, def: WeaponDef): number {
  const rpm = def.fire.rpm * effectMult(player, 'fireRate')
  return 60 / Math.max(1, rpm)
}

export function canReload(def: WeaponDef): boolean {
  return def.fire.magazine > 0
}

export function startReload(world: World, player: Player, id: string): void {
  const rt = player.weapons[id]
  const def = weaponDef(id)
  if (!rt || !canReload(def) || rt.reloading || rt.ammo >= def.fire.magazine) return
  rt.reloading = true
  rt.reloadEndsAt = world.time + def.fire.reload / player.stats.reloadMult
  world.events.push({ type: 'reload', playerId: player.id, weaponId: id })
}

/** Cooldowns, reload completion and deployment timers. */
export function tickWeapons(world: World, player: Player, dt: number): void {
  // Stored style points speed up every cooldown, per the style passive.
  const cdrBonus = 1 + passiveCdr(player)
  for (const id of Object.keys(player.weapons)) {
    const rt = player.weapons[id]
    const def = weaponDef(id)
    rt.fCooldown = Math.max(0, rt.fCooldown - dt * cdrBonus)
    rt.tCooldown = Math.max(0, rt.tCooldown - dt * cdrBonus)
    if (rt.reloading && world.time >= rt.reloadEndsAt) {
      rt.reloading = false
      rt.ammo = def.fire.magazine
    }
    if (rt.deployed && rt.deployEndsAt <= world.time) rt.deployed = player.deployed
    if (!player.deployed && rt.deployed) rt.deployed = false
  }
}

function weaponColor(type: WeaponDef['type']): number {
  switch (type) {
    case 'sniper':
      return 0xbfe9ff
    case 'shotgun':
      return 0xffd08a
    case 'blade':
      return 0xffffff
    case 'explosive':
      return 0xff9a55
    case 'auto':
      return 0xffe68a
    default:
      return 0x9fe6ff
  }
}

interface TargetHit {
  player: Player
  t: number
  point: ReturnType<typeof v3>
  headshot: boolean
}

function raycastPlayers(world: World, origin: ReturnType<typeof v3>, dir: ReturnType<typeof v3>, maxDist: number, shooterId: number): TargetHit | null {
  let best: TargetHit | null = null
  for (const p of world.players) {
    if (!p.alive || p.id === shooterId) continue
    const hit = rayAABB(origin, dir, playerBox(p.pos, p.height))
    if (!hit || hit.t < 0.05 || hit.t > maxDist) continue
    const point = v3(origin.x + dir.x * hit.t, origin.y + dir.y * hit.t, origin.z + dir.z * hit.t)
    const headshot = point.y >= p.pos.y + p.height * 0.8
    if (!best || hit.t < best.t) best = { player: p, t: hit.t, point, headshot }
  }
  return best
}

/** Fire the current weapon. Returns true when a shot was actually produced. */
export function fireWeapon(world: World, player: Player): boolean {
  const id = player.loadout.slots[player.slot]
  if (!id) return false
  const def = weaponDef(id)
  const rt = player.weapons[id]
  if (!rt) return false
  if (rt.reloading) return false
  if (world.time < rt.nextShotAt) return false
  const fire = def.fire

  if (fire.mode === 'melee') {
    rt.nextShotAt = world.time + fireInterval(player, def)
    meleeAttack(world, player, def)
    return true
  }

  if (rt.ammo <= 0) {
    startReload(world, player, id)
    return false
  }

  rt.nextShotAt = world.time + fireInterval(player, def)
  if (!hasInfAmmo(player)) rt.ammo -= 1
  const shotDamageMult = effectMult(player, 'damage')
  const oneShotEffects = player.effects.filter((e) =>
    e.effects.some((eff) => eff.kind === 'nextShot'),
  )
  if (oneShotEffects.length) {
    player.effects = player.effects.filter((e) => !oneShotEffects.includes(e))
  }

  if (fire.mode === 'projectile') {
    const origin = eyePos(player)
    const dir = aimDir(player)
    const guided = player.effects.some((e) => e.effects.some((eff) => eff.kind === 'guided'))
    const cluster = player.effects.some((e) => e.effects.some((eff) => eff.kind === 'cluster'))
    world.projectiles.push({
      id: world.nextEntityId++,
      ownerId: player.id,
      weaponId: id,
      pos: v3(origin.x + dir.x * 0.8, origin.y + dir.y * 0.8, origin.z + dir.z * 0.8),
      vel: v3(dir.x * (fire.projectileSpeed ?? 40), dir.y * (fire.projectileSpeed ?? 40), dir.z * (fire.projectileSpeed ?? 40)),
      damage: fire.damage * player.stats.damageMult * shotDamageMult,
      splashRadius: fire.splashRadius ?? 3,
      life: 4,
      guided,
      cluster,
      gravity: 0,
    })
    if (guided || cluster) {
      // A limited window: the rocket is the ability payload, not a permanent upgrade.
      const consumed = player.effects.filter((e) =>
        e.effects.some((eff) => eff.kind === 'guided' || eff.kind === 'cluster'),
      )
      for (const e of consumed) {
        e.shotsLeft = Math.max(0, e.shotsLeft - 1)
        if (e.shotsLeft <= 0) e.endsAt = world.time
      }
    }
    world.events.push({
      type: 'shot',
      playerId: player.id,
      weaponId: id,
      from: origin,
      to: v3(origin.x + dir.x * 60, origin.y + dir.y * 60, origin.z + dir.z * 60),
      tracer: true,
      color: weaponColor(def.type),
    })
    return true
  }

  const origin = eyePos(player)
  const spread = currentSpread(player, def)
  const pellets = Math.max(1, fire.pellets)
  const wallHits = raycastWorldAll(world.colliders, origin, aimDir(player), fire.range)
  const lethal = activeLethal(player)
  const allowance = pierceAllowance(player)
  const pelletHits = new Map<number, number>()
  const muzzle = v3(origin.x + aimDir(player).x * 0.6, origin.y + aimDir(player).y * 0.6, origin.z + aimDir(player).z * 0.6)

  for (let i = 0; i < pellets; i++) {
    const dir = world.rng.spreadDir(aimDir(player), spread)
    const target = raycastPlayers(world, origin, dir, fire.range, player.id)
    const walls = target
      ? wallHits.filter((h) => h.t < target.t && h.t > 0.1).length
      : 0

    const blocked = target ? walls > allowance : walls > 0
    const tracerEnd = target && !blocked
      ? target.point
      : wallHits.length > 0
        ? wallHits[0].point
        : v3(origin.x + dir.x * fire.range, origin.y + dir.y * fire.range, origin.z + dir.z * fire.range)

    world.events.push({
      type: 'shot',
      playerId: player.id,
      weaponId: id,
      from: muzzle,
      to: tracerEnd,
      tracer: i < 4,
      color: weaponColor(def.type),
    })

    if (!target || blocked) continue

    // Damage: wall penetration uses the table; direct hits use weapon damage.
    let amount: number
    let nonLethalFrac: number | undefined
    if (walls > 0) {
      const table = wallDamage(walls, target.headshot)
      amount = table.leaveAt !== undefined
        ? 0
        : table.fraction * target.player.stats.maxHealth
      if (table.leaveAt !== undefined) {
        nonLethalFrac = undefined
        amount = Math.max(0, target.player.health - table.leaveAt * target.player.stats.maxHealth)
      }
      // A wallbang headshot still kills through 0-4 walls.
      if (target.headshot && table.leaveAt === undefined) {
        applyDamage(world, target.player, player.id, amount, {
          headshot: true,
          source: 'bullet',
          weaponId: id,
          lethal: table.fraction >= 1,
          at: target.point,
        })
        continue
      }
    } else {
      amount = fire.damage * player.stats.damageMult * shotDamageMult
      if (target.headshot) amount *= fire.headshotMult
      if (lethal && lethal.condition === 'B' && isBehind(player, target.player)) {
        applyDamage(world, target.player, player.id, amount, {
          headshot: target.headshot,
          source: 'bullet',
          weaponId: id,
          lethal: true,
          at: target.point,
        })
        continue
      }
      if (lethal && lethal.condition === 'H' && target.headshot) {
        applyDamage(world, target.player, player.id, amount, {
          headshot: true,
          source: 'bullet',
          weaponId: id,
          lethal: true,
          at: target.point,
        })
        continue
      }
      if (lethal) nonLethalFrac = lethal.bodyshotMult
    }

    pelletHits.set(target.player.id, (pelletHits.get(target.player.id) ?? 0) + 1)
    applyDamage(world, target.player, player.id, amount, {
      headshot: target.headshot,
      source: 'bullet',
      weaponId: id,
      nonLethalFrac,
      at: target.point,
    })

    // Explosive-tipped rounds.
    const explosive = player.effects.flatMap((e) => e.effects).find((eff) => eff.kind === 'explosiveRounds')
    if (explosive && explosive.kind === 'explosiveRounds') {
      splash(world, player.id, id, target.point, fire.damage * explosive.mult, explosive.radius, 'bullet')
    }
  }

  // Point-blank lethal check for shotguns.
  if (lethal && lethal.condition === 'P' && fire.lethalPellets) {
    for (const [targetId, count] of pelletHits) {
      if (count < fire.lethalPellets) continue
      const target = world.players.find((p) => p.id === targetId)
      if (!target || !target.alive) continue
      const range = dist(eyePos(player), eyePos(target))
      if (range > LETHAL_PELLET_RANGE) continue
      applyDamage(world, target, player.id, 0, {
        source: 'bullet',
        weaponId: id,
        lethal: true,
        at: eyePos(target),
      })
    }
  }

  return true
}

function hasInfAmmo(player: Player): boolean {
  return player.effects.some((e) => e.effects.some((eff) => eff.kind === 'infAmmo' || eff.kind === 'noReload'))
}

/** True when the attacker is inside the victim's rear 60-degree arc. */
export function isBehind(attacker: Player, victim: Player): boolean {
  const fwd = yawForward(victim.yaw)
  const dx = attacker.pos.x - victim.pos.x
  const dz = attacker.pos.z - victim.pos.z
  const l = Math.hypot(dx, dz) || 1
  const dot = (fwd.x * dx + fwd.z * dz) / l
  return dot < -0.5
}

export function meleeAttack(world: World, player: Player, def: WeaponDef): void {
  const origin = eyePos(player)
  const dir = aimDir(player)
  const reach = def.fire.meleeReach ?? 2.8
  let best: Player | null = null
  let bestScore = 0.35
  for (const p of world.players) {
    if (!p.alive || p.id === player.id) continue
    const to = { x: p.pos.x - origin.x, y: p.pos.y + p.height * 0.6 - origin.y, z: p.pos.z - origin.z }
    const d = Math.hypot(to.x, to.y, to.z)
    if (d > reach + 0.6) continue
    const dot = (to.x * dir.x + to.y * dir.y + to.z * dir.z) / (d || 1)
    if (dot > bestScore) {
      bestScore = dot
      best = p
    }
  }

  const hitPoint = best ? v3(best.pos.x, best.pos.y + best.height * 0.6, best.pos.z) : v3(origin.x + dir.x * reach, origin.y + dir.y * reach, origin.z + dir.z * reach)
  world.events.push({
    type: 'shot',
    playerId: player.id,
    weaponId: def.id,
    from: v3(origin.x + dir.x * 0.4, origin.y - 0.1, origin.z + dir.z * 0.4),
    to: hitPoint,
    tracer: false,
    color: 0xffffff,
  })
  if (!best) return

  const lethalMelee = activeLethalMelee(player)
  const backstab = lethalMelee === 'B' && isBehind(player, best)
  const damage = def.fire.damage * player.stats.damageMult * effectMult(player, 'damage')
  applyDamage(world, best, player.id, backstab ? damage * 4 : damage, {
    source: 'melee',
    weaponId: def.id,
    lethal: backstab,
    nonLethalFrac: lethalMelee ? 0.6 : undefined,
    at: hitPoint,
  })

  // Stealth kills extend the window, per the design.
  if (backstab) {
    for (const e of player.effects) {
      if (e.effects.some((eff) => eff.kind === 'lethalMelee')) e.endsAt += 0.5
    }
  }
}

export function splash(
  world: World,
  ownerId: number,
  weaponId: string,
  pos: ReturnType<typeof v3>,
  damage: number,
  radius: number,
  source: 'bullet' | 'explosion',
): void {
  world.events.push({ type: 'explosion', pos: { ...pos }, radius })
  for (const p of world.players) {
    if (!p.alive) continue
    const d = dist(pos, v3(p.pos.x, p.pos.y + p.height * 0.5, p.pos.z))
    if (d > radius) continue
    const falloff = Math.max(0.25, 1 - d / radius)
    applyDamage(world, p, ownerId, damage * falloff, {
      source: source === 'bullet' ? 'explosion' : 'explosion',
      weaponId,
      at: v3(p.pos.x, p.pos.y + 1.1, p.pos.z),
    })
  }
}

export function updateProjectiles(world: World, dt: number): void {
  const keep: Projectile[] = []
  for (const proj of world.projectiles) {
    proj.life -= dt
    let exploded = false

    if (proj.guided) {
      const owner = world.players.find((p) => p.id === proj.ownerId)
      if (owner && owner.alive) {
        const dir = aimDir(owner)
        const speed = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z)
        // Steer, don't snap: guided rockets still need line of sight.
        const turn = 2.6 * dt
        proj.vel.x += (dir.x * speed - proj.vel.x) * turn
        proj.vel.y += (dir.y * speed - proj.vel.y) * turn
        proj.vel.z += (dir.z * speed - proj.vel.z) * turn
        const l = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z) || 1
        proj.vel.x = (proj.vel.x / l) * speed
        proj.vel.y = (proj.vel.y / l) * speed
        proj.vel.z = (proj.vel.z / l) * speed
      }
    }

    proj.vel.y -= proj.gravity * dt
    const stepLen = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z) * dt
    const dir = {
      x: proj.vel.x / (stepLen / dt || 1),
      y: proj.vel.y / (stepLen / dt || 1),
      z: proj.vel.z / (stepLen / dt || 1),
    }
    const worldHit = raycastWorld(world.colliders, proj.pos, dir, stepLen + 0.2)
    let hitPlayerId = -1
    let hitPoint = v3(proj.pos.x + dir.x * stepLen, proj.pos.y + dir.y * stepLen, proj.pos.z + dir.z * stepLen)
    let bestT = worldHit ? worldHit.t : stepLen + 0.2

    for (const p of world.players) {
      if (!p.alive || p.id === proj.ownerId) continue
      const hit = rayAABB(proj.pos, dir, playerBox(p.pos, p.height))
      if (hit && hit.t >= 0 && hit.t < bestT) {
        bestT = hit.t
        hitPlayerId = p.id
      }
    }
    if (hitPlayerId >= 0) {
      hitPoint = v3(proj.pos.x + dir.x * bestT, proj.pos.y + dir.y * bestT, proj.pos.z + dir.z * bestT)
    } else if (worldHit) {
      hitPoint = worldHit.point
    }

    if (hitPlayerId >= 0 || worldHit || proj.life <= 0) {
      exploded = true
      if (hitPlayerId >= 0) {
        const victim = world.players.find((p) => p.id === hitPlayerId)
        if (victim) {
          applyDamage(world, victim, proj.ownerId, proj.damage, {
            source: 'explosion',
            weaponId: proj.weaponId,
            at: hitPoint,
          })
        }
      }
      splash(world, proj.ownerId, proj.weaponId, hitPoint, proj.damage * 0.7, proj.splashRadius, 'explosion')
      if (proj.cluster) {
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 + world.rng.range(0, 0.8)
          const speed = world.rng.range(6, 11)
          keep.push({
            id: world.nextEntityId++,
            ownerId: proj.ownerId,
            weaponId: proj.weaponId,
            pos: v3(hitPoint.x, hitPoint.y + 0.3, hitPoint.z),
            vel: v3(Math.cos(angle) * speed, 6, Math.sin(angle) * speed),
            damage: 45,
            splashRadius: 2.4,
            life: 1.4,
            guided: false,
            cluster: false,
            gravity: 18,
          })
        }
      }
    }

    if (!exploded) {
      proj.pos = v3(proj.pos.x + proj.vel.x * dt, proj.pos.y + proj.vel.y * dt, proj.pos.z + proj.vel.z * dt)
      keep.push(proj)
    }
  }
  world.projectiles = keep
}
