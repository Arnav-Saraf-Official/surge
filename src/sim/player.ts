import type { UpgradeKey } from '../data/types'
import { emptyUpgrades } from '../data/upgrades'
import { weapon as weaponDef } from '../data/weapons'
import type { DerivedStats, Loadout, Player, WeaponRuntime } from './types'
import { STAND_HEIGHT } from './collision'
import type { Vec3 } from '../core/math'
import { v3 } from '../core/math'

export const SLOT_COUNT = 7

const EMPTY_SLOT_BUFFS = ['health', 'speed', 'reload', 'cooldown', 'mobility'] as const
type EmptyBuff = (typeof EMPTY_SLOT_BUFFS)[number]

export function emptyLoadout(): Loadout {
  return { slots: new Array(SLOT_COUNT).fill(null) }
}

export function equippedWeapons(loadout: Loadout): string[] {
  return loadout.slots.filter((s): s is string => !!s)
}

/**
 * Loadout rules from the design doc:
 * - each empty slot grants the next rotating buff, max 2 stacks of each
 * - exactly one weapon gains the Specialist package, two gain half of it
 * - upgrade points stack additively on top
 */
export function deriveStats(loadout: Loadout, upgrades: Record<UpgradeKey, number>): DerivedStats {
  const equipped = equippedWeapons(loadout)
  const emptySlots = SLOT_COUNT - equipped.length
  const stacks: Record<EmptyBuff, number> = { health: 0, speed: 0, reload: 0, cooldown: 0, mobility: 0 }
  const buffs: string[] = []

  if (equipped.length >= 3) {
    let cursor = 0
    for (let i = 0; i < emptySlots; i++) {
      let guard = 0
      while (stacks[EMPTY_SLOT_BUFFS[cursor % EMPTY_SLOT_BUFFS.length]] >= 2 && guard < EMPTY_SLOT_BUFFS.length) {
        cursor++
        guard++
      }
      const buff = EMPTY_SLOT_BUFFS[cursor % EMPTY_SLOT_BUFFS.length]
      stacks[buff]++
      cursor++
    }
    for (const buff of EMPTY_SLOT_BUFFS) {
      if (stacks[buff] > 0) buffs.push(`${buffLabel(buff)} +${stacks[buff] * 5}%`.replace('health +5%', 'health +5'))
    }
  }

  const specialist = equipped.length === 1
  const duelist = equipped.length === 2
  const packageScale = specialist ? 1 : duelist ? 0.5 : 0

  const maxHealth =
    100 + stacks.health * 5 + Math.round(20 * packageScale) + upgrades.vitality * 10
  const speedMult =
    1 + stacks.speed * 0.05 + 0.1 * packageScale + upgrades.agility * 0.04
  const reloadMult = 1 + stacks.reload * 0.05 + upgrades.dexterity * 0.06
  const cdrRaw = stacks.cooldown * 0.05 + 0.15 * packageScale + upgrades.focus * 0.04
  const cdr = Math.min(0.6, cdrRaw)

  return {
    maxHealth,
    speedMult,
    reloadMult,
    cdr,
    slideMult: (1 + stacks.mobility * 0.05) * (1 + upgrades.agility * 0.05),
    grappleRange: 30 + upgrades.grapple * 4,
    grappleCd: 4 * (1 - upgrades.grapple * 0.08),
    damageMult: 1 + 0.1 * packageScale + upgrades.might * 0.03,
    tChargeMult: 1 + upgrades.focus * 0.03,
    specialist,
    duelist,
    emptySlots,
    buffs,
  }
}

function buffLabel(buff: EmptyBuff): string {
  switch (buff) {
    case 'health':
      return 'health'
    case 'speed':
      return 'move speed +'
    case 'reload':
      return 'reload speed +'
    case 'cooldown':
      return 'cooldown +'
    case 'mobility':
      return 'slide/grapple speed +'
  }
}

export function makeWeaponRuntime(id: string): WeaponRuntime {
  const def = weaponDef(id)
  return {
    id,
    ammo: def.fire.magazine,
    reloading: false,
    reloadEndsAt: 0,
    nextShotAt: 0,
    fCooldown: 0,
    tCooldown: 0,
    tCharge: 0,
    deployed: false,
    deployEndsAt: 0,
    windowShots: 0,
  }
}

export interface CreatePlayerOptions {
  id: number
  name: string
  slot: number
  isBot?: boolean
  botSkill?: number
  loadout?: Loadout
  upgrades?: Record<UpgradeKey, number>
  spawn: Vec3
}

export function createPlayer(opts: CreatePlayerOptions): Player {
  const loadout = opts.loadout ?? emptyLoadout()
  const upgrades = opts.upgrades ?? emptyUpgrades()
  const weapons: Record<string, WeaponRuntime> = {}
  for (const id of equippedWeapons(loadout)) weapons[id] = makeWeaponRuntime(id)
  const stats = deriveStats(loadout, upgrades)

  return {
    id: opts.id,
    name: opts.name,
    isBot: opts.isBot ?? false,
    botSkill: opts.botSkill ?? 0.5,
    loadout,
    upgrades,
    stats,
    pos: { ...opts.spawn },
    vel: v3(),
    yaw: 0,
    pitch: 0,
    eyeHeight: 1.6,
    height: STAND_HEIGHT,
    onGround: false,
    crouching: false,
    sliding: false,
    slideTimer: 0,
    slideReadyAt: 0,
    lastSlideAt: -999,
    jumpsUsed: 0,
    sprinting: false,
    grappling: false,
    wasAirborne: false,
    deployed: false,
    aiming: false,
    health: stats.maxHealth,
    alive: true,
    respawnAt: 0,
    lastDamageAt: -999,
    lastCombatAt: -999,
    exposedUntil: 0,
    invulnerableUntil: 0,
    slot: opts.slot,
    weapons,
    effects: [],
    grapples: [
      { active: false, anchor: v3(), length: 0, cooldown: 0, swinging: false, firedAt: 0 },
      { active: false, anchor: v3(), length: 0, cooldown: 0, swinging: false, firedAt: 0 },
    ],
    sp: 0,
    spSpentRecently: 0,
    kills: 0,
    deaths: 0,
    streak: 0,
    score: 0,
    lastKillAt: -999,
    multikillAnchor: -999,
    multikillCount: 0,
    markedUntil: 0,
    revealUntil: 0,
    invisibility: 0,
    quickReturnSlot: -1,
    quickReturnAt: 0,
    botBrain: (opts.isBot ?? false)
      ? {
          targetId: -1,
          strafe: 1,
          nextDecisionAt: 0,
          aimYaw: 0,
          aimPitch: 0,
          stuckTime: 0,
          wanderX: 0,
          wanderZ: 0,
          nextWanderAt: 0,
          nextJumpAt: 0,
        }
      : null,
  }
}

/** The weapon currently held, or null when every slot is empty. */
export function currentWeaponId(player: Player): string | null {
  const id = player.loadout.slots[player.slot]
  return id && player.weapons[id] ? id : firstEquippedSlot(player)?.id ?? null
}

export interface SlotRef {
  id: string
  slot: number
}

export function firstEquippedSlot(player: Player): SlotRef | null {
  for (let i = 0; i < player.loadout.slots.length; i++) {
    const id = player.loadout.slots[i]
    if (id && player.weapons[id]) return { id, slot: i }
  }
  return null
}

export function findSlotOf(player: Player, weaponId: string): number {
  return player.loadout.slots.indexOf(weaponId)
}
