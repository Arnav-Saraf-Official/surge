import { aabbOverlap, clamp, dist, lenXZ, rayAABB, v3, yawForward } from '../core/math'
import type { WeaponDef } from '../data/types'
import { weapon as weaponDef } from '../data/weapons'
import { playerBox, raycastWorld, raycastWorldAll } from './collision'
import { activeLethal, activeLethalMelee, applyDamage } from './damage'
import { effectMult } from './effects'
import { friendly } from './teams'
import { SPRINT_SPEED, aimDir, eyePos } from './movement'
import { passiveCdr } from './style'
import type { Player, Projectile, World } from './types'

export const LETHAL_PELLET_RANGE = 4
export const WALL_DAMAGE_MIN = 0.1
/** Katana neck slices hit far harder and can decapitate outright. */
export const KATANA_NECK_MULT = 1.75
export const KATANA_NECK_INSTAKILL = 0.1
const NECK_ZONE_MIN = 0.66
const NECK_ZONE_MAX = 0.87

/** Thrown-knife tuning. */
export const KNIFE_AIM_DAMAGE = 68
export const KNIFE_CHASE_LIFE = 45
const KNIFE_FLURRY_COUNT = 16
const KNIFE_CURVE_COUNT = 5
const KNIFE_CHASE_SPEED = 13
const KNIFE_CHASE_TURN = 2.6
const KNIFE_PROBE = 6
const DEFLECT_DAMAGE = 16
const DEFLECT_CHARGES = 3

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
    // A planted crouch steadies the shot, for humans and bots alike.
    if (player.crouching) spread *= 0.7
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
    rt.altCooldown = Math.max(0, rt.altCooldown - dt * cdrBonus)
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

interface QuickScopeTarget {
  player: Player
  dir: ReturnType<typeof v3>
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

function findQuickScopeTarget(
  world: World,
  shooter: Player,
  origin: ReturnType<typeof v3>,
  crosshair: ReturnType<typeof v3>,
  maxRange: number,
  angleDeg: number,
): QuickScopeTarget | null {
  const minDot = Math.cos((angleDeg * Math.PI) / 180)
  let best: QuickScopeTarget | null = null
  let bestDistance = Infinity

  for (const player of world.players) {
    if (!player.alive || player.id === shooter.id) continue
    const head = v3(player.pos.x, player.pos.y + player.height * 0.9, player.pos.z)
    const dx = head.x - origin.x
    const dy = head.y - origin.y
    const dz = head.z - origin.z
    const distance = Math.hypot(dx, dy, dz)
    if (distance > maxRange || distance >= bestDistance) continue
    const inverseDistance = 1 / Math.max(distance, 1e-6)
    const dir = v3(dx * inverseDistance, dy * inverseDistance, dz * inverseDistance)
    const alignment = dir.x * crosshair.x + dir.y * crosshair.y + dir.z * crosshair.z
    if (alignment < minDot) continue
    best = { player, dir }
    bestDistance = distance
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
    // Paired knives cut with both blades: a second strike finds the next target.
    if (fire.dualMelee) meleeAttack(world, player, def, 1)
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
  const quickScopeEffect = player.effects.find(
    (effect) => effect.weaponId === id && effect.effects.some((entry) => entry.kind === 'quickScope'),
  )
  const phantomSightEffect = id === 'ghostline'
    ? player.effects.find((effect) => effect.effects.some((entry) => entry.kind === 'phantomSight'))
    : undefined
  const quickScopeSettings = quickScopeEffect?.effects.find((entry) => entry.kind === 'quickScope')
  const crosshair = aimDir(player)
  const quickScopeTarget =
    quickScopeSettings?.kind === 'quickScope'
      ? findQuickScopeTarget(
          world,
          player,
          origin,
          crosshair,
          fire.range * quickScopeSettings.rangeMult,
          quickScopeSettings.angleDeg,
        )
      : null
  const shotDir = quickScopeTarget?.dir ?? crosshair
  const shotRange = quickScopeTarget && quickScopeSettings?.kind === 'quickScope'
    ? fire.range * quickScopeSettings.rangeMult
    : fire.range
  const wallHits = raycastWorldAll(world.colliders, origin, shotDir, shotRange)
  const lethal = activeLethal(player)
  const allowance = pierceAllowance(player) + (phantomSightEffect ? 6 : 0)
  const pelletHits = new Map<number, number>()
  const muzzle = v3(origin.x + shotDir.x * 0.6, origin.y + shotDir.y * 0.6, origin.z + shotDir.z * 0.6)

  for (let i = 0; i < pellets; i++) {
    const dir = quickScopeTarget ? shotDir : world.rng.spreadDir(shotDir, spread)
    const hit = raycastPlayers(world, origin, dir, shotRange, player.id)
    const quickScopeHeadshot = hit?.player.id === quickScopeTarget?.player.id
    const target = hit
      ? { ...hit, headshot: quickScopeHeadshot || hit.headshot }
      : null
    const walls = target
      ? wallHits.filter((h) => h.t < target.t && h.t > 0.1).length
      : 0

    const blocked = target ? walls > allowance : walls > 0
    const tracerEnd = target && !blocked
      ? target.point
      : wallHits.length > 0
        ? wallHits[0].point
        : v3(origin.x + dir.x * shotRange, origin.y + dir.y * shotRange, origin.z + dir.z * shotRange)

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
    if (tryDeflect(world, player, target.player, target.point)) continue
    if (quickScopeHeadshot && quickScopeEffect) {
      player.effects = player.effects.filter((effect) => effect !== quickScopeEffect)
      rt.fCooldown = def.f.cooldown * (1 - player.stats.cdr)
      world.events.push({ type: 'abilityEnd', playerId: player.id, abilityId: quickScopeEffect.abilityId })
    }

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

  if (phantomSightEffect) {
    phantomSightEffect.shotsLeft -= 1
    if (phantomSightEffect.shotsLeft <= 0) {
      player.effects = player.effects.filter((effect) => effect !== phantomSightEffect)
      world.events.push({ type: 'abilityEnd', playerId: player.id, abilityId: phantomSightEffect.abilityId })
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

export function meleeAttack(world: World, player: Player, def: WeaponDef, strike = 0): void {
  const origin = eyePos(player)
  const dir = aimDir(player)
  const reach = def.fire.meleeReach ?? 2.8
  const candidates: Array<{ player: Player; dot: number }> = []
  for (const p of world.players) {
    if (!p.alive || p.id === player.id) continue
    if (friendly(world, player, p)) continue
    const to = { x: p.pos.x - origin.x, y: p.pos.y + p.height * 0.6 - origin.y, z: p.pos.z - origin.z }
    const d = Math.hypot(to.x, to.y, to.z)
    if (d > reach + 0.6) continue
    const dot = (to.x * dir.x + to.y * dir.y + to.z * dir.z) / (d || 1)
    if (dot > 0.35) candidates.push({ player: p, dot })
  }
  candidates.sort((a, b) => b.dot - a.dot)
  // The paired second blade still lands when there is only one target.
  const best: Player | null = candidates[strike]?.player ?? (strike > 0 ? candidates[0]?.player ?? null : null)

  let hitPoint = best ? v3(best.pos.x, best.pos.y + best.height * 0.6, best.pos.z) : v3(origin.x + dir.x * reach, origin.y + dir.y * reach, origin.z + dir.z * reach)
  let zone: 'body' | 'neck' | 'head' = 'body'
  if (best) {
    // Use the real aim-ray contact so a neck slice is a place you hit, not a flag.
    const contact = rayAABB(origin, dir, playerBox(best.pos, best.height))
    if (contact && contact.t >= 0) {
      hitPoint = v3(origin.x + dir.x * contact.t, origin.y + dir.y * contact.t, origin.z + dir.z * contact.t)
    }
    const relative = clamp((hitPoint.y - best.pos.y) / Math.max(0.1, best.height), 0, 1.2)
    zone = relative >= NECK_ZONE_MAX ? 'head' : relative >= NECK_ZONE_MIN ? 'neck' : 'body'
  }
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
  const neck = def.id === 'katana' && zone === 'neck'
  const instakill = neck && world.rng.next() < KATANA_NECK_INSTAKILL
  let damage = def.fire.damage * player.stats.damageMult * effectMult(player, 'damage')
  if (backstab) damage *= 4
  if (neck) damage *= KATANA_NECK_MULT
  applyDamage(world, best, player.id, damage, {
    source: 'melee',
    weaponId: def.id,
    neck,
    lethal: backstab || instakill,
    nonLethalFrac: lethalMelee && !backstab && !neck ? 0.6 : undefined,
    at: hitPoint,
  })

  // Stealth kills extend the window, per the design.
  if (backstab) {
    for (const e of player.effects) {
      if (e.effects.some((eff) => eff.kind === 'lethalMelee')) e.endsAt += 0.5
    }
  }
}

/**
 * Thrown knives: a fast aimed throw, a sixteen-blade ring (Flurry), and five
 * chasing blades (Curve Ball) that steer around cover and persist for 45 s.
 */
function knifeDamage(player: Player, base: number): number {
  return base * player.stats.damageMult * effectMult(player, 'damage')
}

function pushKnife(
  world: World,
  player: Player,
  weaponId: string,
  dir: ReturnType<typeof v3>,
  opts: { speed: number; damage: number; life: number; gravity: number; chase?: boolean; targetId?: number },
): void {
  const origin = eyePos(player)
  const l = Math.hypot(dir.x, dir.y, dir.z) || 1
  const nx = dir.x / l
  const ny = dir.y / l
  const nz = dir.z / l
  world.projectiles.push({
    id: world.nextEntityId++,
    ownerId: player.id,
    weaponId,
    pos: v3(origin.x + nx * 0.55, origin.y + ny * 0.55, origin.z + nz * 0.55),
    vel: v3(nx * opts.speed, ny * opts.speed, nz * opts.speed),
    damage: opts.damage,
    splashRadius: 0,
    life: opts.life,
    guided: false,
    cluster: false,
    gravity: opts.gravity,
    kind: 'knife',
    chase: opts.chase ?? false,
    targetId: opts.targetId ?? -1,
    age: 0,
  })
}

/** RMB release: one heavy knife along the crosshair. */
export function throwAimedKnife(world: World, player: Player): boolean {
  const id = player.loadout.slots[player.slot]
  if (!id || weaponDef(id).type !== 'blade') return false
  pushKnife(world, player, id, aimDir(player), {
    speed: 34,
    damage: knifeDamage(player, KNIFE_AIM_DAMAGE),
    life: 4,
    gravity: 5,
  })
  return true
}

/** F — Flurry: sixteen knives, one every 22.5 degrees. */
export function knifeFlurry(world: World, player: Player): void {
  const id = player.loadout.slots[player.slot]
  if (!id) return
  for (let i = 0; i < KNIFE_FLURRY_COUNT; i++) {
    const angle = (i / KNIFE_FLURRY_COUNT) * Math.PI * 2
    pushKnife(world, player, id, v3(Math.cos(angle), 0.03, Math.sin(angle)), {
      speed: 21,
      damage: knifeDamage(player, 34),
      life: 2.4,
      gravity: 4,
    })
  }
}

/** T — Curve Ball: five knives that hunt their assigned target. */
export function knifeCurve(world: World, player: Player): void {
  const id = player.loadout.slots[player.slot]
  if (!id) return
  const enemies = world.players
    .filter((p) => p.alive && p.id !== player.id && !friendly(world, player, p))
    .sort((a, b) => dist(player.pos, a.pos) - dist(player.pos, b.pos))
  const base = aimDir(player)
  for (let i = 0; i < KNIFE_CURVE_COUNT; i++) {
    const spread = (i - (KNIFE_CURVE_COUNT - 1) / 2) * 0.22
    const c = Math.cos(spread)
    const s = Math.sin(spread)
    const dir = v3(base.x * c - base.z * s, base.y, base.x * s + base.z * c)
    pushKnife(world, player, id, dir, {
      speed: 17,
      damage: knifeDamage(player, 46),
      life: KNIFE_CHASE_LIFE,
      gravity: 0,
      chase: true,
      targetId: enemies.length ? enemies[i % enemies.length].id : -1,
    })
  }
}

/** A katana parry only stops shots that arrive from the front. */
function facingShot(world: World, defender: Player, origin: ReturnType<typeof v3>): boolean {
  if (defender.deflectUntil <= world.time || defender.deflectCharges <= 0) return false
  const dx = origin.x - defender.pos.x
  const dz = origin.z - defender.pos.z
  const l = Math.hypot(dx, dz) || 1
  const fx = -Math.sin(defender.yaw)
  const fz = -Math.cos(defender.yaw)
  return (dx * fx + dz * fz) / l > 0.4
}

/** Returns true when the shot was deflected instead of hitting. */
function tryDeflect(
  world: World,
  shooter: Player,
  defender: Player,
  point: ReturnType<typeof v3>,
): boolean {
  const origin = eyePos(shooter)
  if (!facingShot(world, defender, origin)) return false
  defender.deflectCharges -= 1
  world.events.push({
    type: 'shot',
    playerId: defender.id,
    weaponId: 'katana',
    from: point,
    to: origin,
    tracer: true,
    color: 0x9fe6ff,
  })
  applyDamage(world, shooter, defender.id, DEFLECT_DAMAGE, {
    source: 'bullet',
    weaponId: 'katana',
    at: origin,
  })
  return true
}

/** Right-click blade techniques. Returns true when something happened. */
export function useBladeAlt(world: World, player: Player): boolean {
  if (!player.alive || player.hiding) return false
  const id = player.loadout.slots[player.slot]
  if (!id) return false
  const def = weaponDef(id)
  const alt = def.alt
  if (!alt) return false
  const rt = player.weapons[id]
  if (!rt || rt.altCooldown > 0 || world.time < player.exposedUntil) return false
  const announcer = () =>
    world.events.push({ type: 'ability', playerId: player.id, abilityId: alt.kind, name: alt.name, slot: 'F' })

  switch (alt.kind) {
    case 'deflect': {
      player.deflectUntil = world.time + (alt.window ?? 0.4)
      player.deflectCharges = DEFLECT_CHARGES
      rt.altCooldown = alt.cooldown * (1 - player.stats.cdr)
      announcer()
      return true
    }
    case 'throw': {
      if (!throwAimedKnife(world, player)) return false
      rt.altCooldown = alt.cooldown * (1 - player.stats.cdr)
      return true
    }
    case 'reap': {
      const radius = 3.6
      let hitAny = false
      for (const target of world.players) {
        if (!target.alive || target.id === player.id || friendly(world, player, target)) continue
        const dx = target.pos.x - player.pos.x
        const dz = target.pos.z - player.pos.z
        const d = Math.hypot(dx, dz)
        if (d > radius) continue
        hitAny = true
        applyDamage(world, target, player.id, knifeDamage(player, 58), {
          source: 'ability',
          weaponId: id,
          at: v3(target.pos.x, target.pos.y + target.height * 0.5, target.pos.z),
        })
        if (d > 0.01) {
          const pull = 7 * (1 - d / radius)
          target.vel.x -= (dx / d) * pull
          target.vel.z -= (dz / d) * pull
          target.vel.y = Math.max(target.vel.y, 1.5)
        }
      }
      rt.altCooldown = alt.cooldown * (1 - player.stats.cdr)
      announcer()
      return hitAny
    }
    case 'blink': {
      let best: Player | null = null
      let bestDist = 9
      const fwdX = -Math.sin(player.yaw)
      const fwdZ = -Math.cos(player.yaw)
      for (const target of world.players) {
        if (!target.alive || target.id === player.id || friendly(world, player, target)) continue
        const dx = target.pos.x - player.pos.x
        const dz = target.pos.z - player.pos.z
        const d = Math.hypot(dx, dz)
        if (d > bestDist) continue
        if (d > 0.01 && (dx * fwdX + dz * fwdZ) / d < -0.2) continue
        best = target
        bestDist = d
      }
      if (!best) return false
      const behind = yawForward(best.yaw)
      const dest = v3(
        best.pos.x - behind.x * 1.3,
        best.pos.y,
        best.pos.z - behind.z * 1.3,
      )
      if (world.colliders.some((c) => aabbOverlap(playerBox(dest, player.height), c))) return false
      const eye = eyePos(player)
      const toX = dest.x - eye.x
      const toY = dest.y + player.height * 0.5 - eye.y
      const toZ = dest.z - eye.z
      const d = Math.hypot(toX, toY, toZ)
      if (d > 0.1) {
        const blocked = raycastWorld(world.colliders, eye, v3(toX / d, toY / d, toZ / d), Math.max(0, d - 0.4))
        if (blocked) return false
      }
      player.pos = dest
      player.vel = v3()
      player.yaw = Math.atan2(-(best.pos.x - dest.x), -(best.pos.z - dest.z))
      meleeAttack(world, player, def)
      rt.altCooldown = alt.cooldown * (1 - player.stats.cdr)
      announcer()
      return true
    }
  }
}

function rotateY(dir: ReturnType<typeof v3>, angle: number): ReturnType<typeof v3> {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return v3(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c)
}

function knifeClearance(world: World, pos: ReturnType<typeof v3>, dir: ReturnType<typeof v3>): number {
  const hit = raycastWorld(world.colliders, pos, dir, KNIFE_PROBE)
  return hit ? hit.t : KNIFE_PROBE
}

/** Approximate outward normal of the box face a hit point sits on. */
function faceNormal(box: { min: ReturnType<typeof v3>; max: ReturnType<typeof v3> }, point: ReturnType<typeof v3>): ReturnType<typeof v3> {
  const candidates: Array<[number, ReturnType<typeof v3>]> = [
    [Math.abs(point.x - box.min.x), v3(-1, 0, 0)],
    [Math.abs(point.x - box.max.x), v3(1, 0, 0)],
    [Math.abs(point.y - box.min.y), v3(0, -1, 0)],
    [Math.abs(point.y - box.max.y), v3(0, 1, 0)],
    [Math.abs(point.z - box.min.z), v3(0, 0, -1)],
    [Math.abs(point.z - box.max.z), v3(0, 0, 1)],
  ]
  candidates.sort((a, b) => a[0] - b[0])
  return candidates[0][1]
}

/** Turn a velocity so it runs along a wall, choosing the side that faces the target. */
function slideAlongWall(
  box: { min: ReturnType<typeof v3>; max: ReturnType<typeof v3> },
  point: ReturnType<typeof v3>,
  vel: ReturnType<typeof v3>,
  toward: ReturnType<typeof v3>,
): ReturnType<typeof v3> {
  const n = faceNormal(box, point)
  const into = vel.x * n.x + vel.y * n.y + vel.z * n.z
  let tx = vel.x - n.x * into
  let ty = vel.y - n.y * into
  let tz = vel.z - n.z * into
  let tl = Math.hypot(tx, ty, tz)
  if (tl < 0.1) {
    // Head-on: pick either tangent, then face the target.
    tx = -n.z
    ty = 0
    tz = n.x
    tl = Math.hypot(tx, ty, tz) || 1
  }
  if (tx * toward.x + ty * toward.y + tz * toward.z < 0) {
    tx = -tx
    ty = -ty
    tz = -tz
  }
  return v3((tx / tl) * KNIFE_CHASE_SPEED, (ty / tl) * KNIFE_CHASE_SPEED, (tz / tl) * KNIFE_CHASE_SPEED)
}

/** Nearest clear corner of a blocker, measured by the path through it. */
function detourPoint(
  box: { min: ReturnType<typeof v3>; max: ReturnType<typeof v3> },
  pos: ReturnType<typeof v3>,
  target: ReturnType<typeof v3>,
): ReturnType<typeof v3> {
  const margin = KNIFE_CHASE_SPEED * 0.35
  const corners = [
    v3(box.min.x - margin, pos.y, box.min.z - margin),
    v3(box.max.x + margin, pos.y, box.min.z - margin),
    v3(box.min.x - margin, pos.y, box.max.z + margin),
    v3(box.max.x + margin, pos.y, box.max.z + margin),
  ]
  let best = corners[0]
  let bestCost = Infinity
  for (const corner of corners) {
    const cost = dist(pos, corner) + dist(corner, target)
    if (cost < bestCost) {
      bestCost = cost
      best = corner
    }
  }
  return best
}

/** Curve Ball steering: prefer the target, slide along whatever blocks it. */
function steerChasingKnife(world: World, proj: Projectile, dt: number): 'resume' | 'pause' | 'expired' {
  if (proj.life <= 0) return 'expired'
  proj.age = (proj.age ?? 0) + dt
  let target =
    proj.targetId !== undefined && proj.targetId >= 0
      ? world.players.find((p) => p.id === proj.targetId) ?? null
      : null
  if (!target) {
    let best: Player | null = null
    let bestDist = Infinity
    for (const p of world.players) {
      if (!p.alive || p.id === proj.ownerId) continue
      const d = dist(proj.pos, p.pos)
      if (d < bestDist) {
        bestDist = d
        best = p
      }
    }
    target = best
    proj.targetId = best?.id ?? -1
  }
  // A dead target pauses the blades in mid-air; they resume on respawn.
  if (!target || !target.alive) {
    proj.vel = v3()
    return 'pause'
  }

  const aimPoint = v3(target.pos.x, target.pos.y + target.height * 0.55, target.pos.z)
  const desired = v3(aimPoint.x - proj.pos.x, aimPoint.y - proj.pos.y, aimPoint.z - proj.pos.z)
  const dl = Math.hypot(desired.x, desired.y, desired.z) || 1
  desired.x /= dl
  desired.y /= dl
  desired.z /= dl

  // Close to cover, commit to a corner waypoint instead of hugging the face.
  const near = raycastWorld(world.colliders, proj.pos, desired, 2.5)
  if (near) {
    const corner = detourPoint(world.colliders[near.index], proj.pos, aimPoint)
    const cx = corner.x - proj.pos.x
    const cy = corner.y - proj.pos.y
    const cz = corner.z - proj.pos.z
    const cl = Math.hypot(cx, cy, cz) || 1
    proj.vel = v3((cx / cl) * KNIFE_CHASE_SPEED, (cy / cl) * KNIFE_CHASE_SPEED, (cz / cl) * KNIFE_CHASE_SPEED)
    return 'resume'
  }

  let bestDir = desired
  let bestClear = knifeClearance(world, proj.pos, desired)
  for (const offset of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.5, -1.5, 2.0, -2.0]) {
    const candidate = rotateY(desired, offset)
    const clear = knifeClearance(world, proj.pos, candidate)
    if (clear > bestClear + 0.6) {
      bestClear = clear
      bestDir = candidate
    }
  }

  const turn = Math.min(1, KNIFE_CHASE_TURN * dt)
  const vx = proj.vel.x + (bestDir.x * KNIFE_CHASE_SPEED - proj.vel.x) * turn
  const vy = proj.vel.y + (bestDir.y * KNIFE_CHASE_SPEED - proj.vel.y) * turn
  const vz = proj.vel.z + (bestDir.z * KNIFE_CHASE_SPEED - proj.vel.z) * turn
  const l = Math.hypot(vx, vy, vz) || 1
  proj.vel.x = (vx / l) * KNIFE_CHASE_SPEED
  proj.vel.y = (vy / l) * KNIFE_CHASE_SPEED
  proj.vel.z = (vz / l) * KNIFE_CHASE_SPEED
  return 'resume'
}

/** Move a knife in short substeps and resolve the first thing it touches. */
function stepKnife(world: World, proj: Projectile, dt: number): boolean {
  if (proj.life <= 0) return false
  if (proj.chase) {
    const state = steerChasingKnife(world, proj, dt)
    if (state === 'expired') return false
    if (state === 'pause') return true
  } else {
    proj.vel.y -= proj.gravity * dt
  }

  const speed = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z)
  if (speed < 1e-4) return true
  const stepLen = speed * dt
  const steps = Math.max(1, Math.ceil(stepLen / 0.35))
  const per = stepLen / steps

  for (let s = 0; s < steps; s++) {
    const stepSpeed = Math.hypot(proj.vel.x, proj.vel.y, proj.vel.z)
    if (stepSpeed < 1e-4) return true
    const dir = v3(proj.vel.x / stepSpeed, proj.vel.y / stepSpeed, proj.vel.z / stepSpeed)
    const hit = raycastWorld(world.colliders, proj.pos, dir, per + 0.02)
    if (hit) {
      if (!proj.chase) return false
      // Chase blades scrape along cover instead of shattering on it. Nudge just
      // off the face so the next sub-step does not start inside the surface.
      const box = world.colliders[hit.index]
      const n = faceNormal(box, hit.point)
      proj.pos = v3(hit.point.x + n.x * 0.05, hit.point.y + n.y * 0.05, hit.point.z + n.z * 0.05)
      proj.vel = slideAlongWall(box, hit.point, proj.vel, dir)
      continue
    }
    let victim: Player | null = null
    let bestT = per + 0.02
    for (const p of world.players) {
      if (!p.alive || p.id === proj.ownerId) continue
      const playerHit = rayAABB(proj.pos, dir, playerBox(p.pos, p.height))
      if (playerHit && playerHit.t >= 0 && playerHit.t < bestT) {
        bestT = playerHit.t
        victim = p
      }
    }
    if (victim) {
      const point = v3(proj.pos.x + dir.x * bestT, proj.pos.y + dir.y * bestT, proj.pos.z + dir.z * bestT)
      const headshot = point.y >= victim.pos.y + victim.height * 0.8
      applyDamage(world, victim, proj.ownerId, proj.damage * (headshot ? 1.6 : 1), {
        source: 'ability',
        weaponId: proj.weaponId,
        headshot,
        at: point,
      })
      return false
    }
    proj.pos = v3(proj.pos.x + dir.x * per, proj.pos.y + dir.y * per, proj.pos.z + dir.z * per)
  }
  return proj.pos.y >= world.map.killY
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
    if (proj.kind === 'knife') {
      if (stepKnife(world, proj, dt)) keep.push(proj)
      continue
    }
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
