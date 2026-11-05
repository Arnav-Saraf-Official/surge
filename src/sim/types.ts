import type { AABB, Vec3 } from '../core/math'
import type { MapDef } from '../data/types'
import type { Condition, UpgradeKey } from '../data/types'

/** Reasons a damage event happened, used for style points and kill feed text. */
export type DamageSource = 'bullet' | 'melee' | 'explosion' | 'bleed' | 'fall' | 'ability'

export interface GrappleRuntime {
  active: boolean
  anchor: Vec3
  /** Current rope radius; without boost it tracks the closest distance reached. */
  length: number
  cooldown: number
  /** Held long enough to count as a swing rather than a zip. */
  swinging: boolean
  firedAt: number
}

export interface WeaponRuntime {
  id: string
  ammo: number
  reloading: boolean
  reloadEndsAt: number
  nextShotAt: number
  fCooldown: number
  tCooldown: number
  tCharge: number
  /** Tripod / deployed state (Warhound). */
  deployed: boolean
  deployEndsAt: number
  /** Shots left in a limited-shot lethal window. */
  windowShots: number
  /** Cooldown for the blade right-click technique. */
  altCooldown: number
}

export interface ActiveEffect {
  abilityId: string
  abilityName: string
  weaponId: string
  slot: 'F' | 'T'
  effects: import('../data/types').Effect[]
  duration: number
  endsAt: number
  lethal?: Condition
  /** Kills landed while this effect was active. */
  kills: number
  /** Damage dealt while active, for heal-on-damage abilities. */
  damageDealt: number
  /** Set for abilities that consume shots, e.g. Wall Piercer. */
  shotsLeft: number
  visionRestoredUntil?: number
  phantomDashUsed?: boolean
}

export interface DerivedStats {
  maxHealth: number
  speedMult: number
  reloadMult: number
  cdr: number
  slideMult: number
  grappleRange: number
  grappleCd: number
  damageMult: number
  tChargeMult: number
  /** Extra max-health / etc from loadout completeness. */
  specialist: boolean
  duelist: boolean
  emptySlots: number
  buffs: string[]
}

export interface Loadout {
  /** Exactly 7 entries; null means empty slot. */
  slots: (string | null)[]
}

export interface Player {
  id: number
  name: string
  isBot: boolean
  botSkill: number
  loadout: Loadout
  upgrades: Record<UpgradeKey, number>
  stats: DerivedStats

  pos: Vec3
  vel: Vec3
  yaw: number
  pitch: number
  eyeHeight: number
  height: number
  onGround: boolean
  crouching: boolean
  /** Concealed inside a hide spot; frozen in place until the player leaves. */
  hiding: boolean
  /** Index into `map.hides`, or -1. */
  hideSpotId: number
  /** 0..1 hold progress for entering or leaving a hide spot. */
  hideProgress: number
  /** A fresh hold is required before the exit timer starts. */
  hideExitArmed: boolean
  /** Where to put the player back when they leave a hide spot. */
  hideReturnPos: Vec3 | null
  sliding: boolean
  slideTimer: number
  slideReadyAt: number
  lastSlideAt: number
  jumpsUsed: number
  sprinting: boolean
  grappling: boolean
  wasAirborne: boolean
  deployed: boolean
  aiming: boolean
  grappleBoostFuel: number
  grappleBoosting: boolean

  health: number
  alive: boolean
  respawnAt: number
  lastDamageAt: number
  lastCombatAt: number
  /** Katana bullet-deflect window and the parries left in it. */
  deflectUntil: number
  deflectCharges: number
  exposedUntil: number
  invulnerableUntil: number

  slot: number
  weapons: Record<string, WeaponRuntime>
  effects: ActiveEffect[]
  grapples: [GrappleRuntime, GrappleRuntime]
  sp: number
  /** Style modifier state, mainly for the HUD. */
  spSpentRecently: number

  kills: number
  deaths: number
  streak: number
  score: number
  lastKillAt: number
  multikillAnchor: number
  multikillCount: number
  /** Damage dealt tracker for the T charge HUD. */
  markedUntil: number
  revealUntil: number
  revealRadius: number
  invisibility: number
  /** Quick-swap bookkeeping for G (explosive) and V (blade). */
  quickReturnSlot: number
  quickReturnAt: number
  botBrain: BotBrain | null
}

export interface BotBrain {
  targetId: number
  strafe: number
  nextDecisionAt: number
  aimYaw: number
  aimPitch: number
  stuckTime: number
  /** When the current target was first spotted, for reaction delay. */
  targetAcquiredAt: number
  crouchUntil: number
  nextCrouchAt: number
  wanderX: number
  wanderZ: number
  nextWanderAt: number
  nextJumpAt: number
}

export interface Projectile {
  id: number
  ownerId: number
  weaponId: string
  pos: Vec3
  vel: Vec3
  damage: number
  splashRadius: number
  life: number
  guided: boolean
  cluster: boolean
  gravity: number
  /** Thrown knives follow their own rules instead of exploding. */
  kind?: 'rocket' | 'knife'
  /** Curve Ball knives chase a target around cover. */
  chase?: boolean
  targetId?: number
  /** Seconds this knife has existed, for the chase report. */
  age?: number
}

export interface Orb {
  id: number
  pos: Vec3
  amount: number
  respawnAt: number
  active: boolean
  temporary: boolean
}

export interface World {
  map: MapDef
  colliders: AABB[]
  colliderKinds: string[]
  players: Player[]
  projectiles: Projectile[]
  orbs: Orb[]
  time: number
  tick: number
  events: SimEvent[]
  rng: import('../core/rng').Rng
  nextEntityId: number
  match: MatchState
}

export interface MatchState {
  mode: 'ffa' | 'training'
  scoreLimit: number
  timeLimit: number
  startedAt: number
  ended: boolean
  winnerId: number | null
  /** Bots that are currently alive, for wave logic later. */
  wave: number
}

export type SimEvent =
  | { type: 'shot'; playerId: number; weaponId: string; from: Vec3; to: Vec3; tracer: boolean; color: number }
  | {
      type: 'hit'
      playerId: number
      targetId: number
      damage: number
      headshot: boolean
      /** Katana neck slice. */
      neck?: boolean
      lethal: boolean
      at: Vec3
    }
  | { type: 'damage'; playerId: number; amount: number; fromId: number; source: DamageSource }
  | { type: 'kill'; killerId: number; victimId: number; weaponId: string; headshot: boolean; neck?: boolean; lethal: boolean; spGain: number }
  | { type: 'hide'; playerId: number; spotId: number; inside: boolean }
  | { type: 'death'; playerId: number }
  | { type: 'respawn'; playerId: number; pos: Vec3 }
  | { type: 'ability'; playerId: number; abilityId: string; name: string; slot: 'F' | 'T' }
  | { type: 'abilityEnd'; playerId: number; abilityId: string }
  | { type: 'exposed'; playerId: number; until: number }
  | { type: 'heal'; playerId: number; amount: number }
  | { type: 'orb'; playerId: number; amount: number; pos: Vec3 }
  | { type: 'explosion'; pos: Vec3; radius: number }
  | { type: 'knockback'; playerId: number; from: Vec3 }
  | { type: 'reload'; playerId: number; weaponId: string }
  | { type: 'grapple'; playerId: number; side: 0 | 1; anchor: Vec3; attached: boolean; zip: boolean }
  | { type: 'mode'; text: string }
  | { type: 'matchEnd'; winnerId: number | null }

export interface InputCmd {
  /** Local-space movement, x = right, z = forward, each -1..1. */
  moveX: number
  moveZ: number
  yaw: number
  pitch: number
  fire: boolean
  jump: boolean
  sprint: boolean
  crouch: boolean
  /** Held hide key (Z); holding near a hide spot conceals the player. */
  hide: boolean
  aim: boolean
  /** Right mouse held (blade aim / throw wind-up). */
  altFire: boolean
  /** Rising edge of the right mouse button. */
  altPress: boolean
  /** Falling edge of the right mouse button, used to release a throw. */
  altRelease: boolean
  /** Rising-edge buttons, consumed by the sim each tick. */
  slide: boolean
  grappleL: boolean
  grappleR: boolean
  grappleBoost: boolean
  abilityF: boolean
  abilityT: boolean
  reload: boolean
  /** Slot index or -1. */
  selectSlot: number
  cycle: number
  /** Style modifier held (Z by default). */
  style: boolean
  melee: boolean
  explosiveQuick: boolean
  bladeQuick: boolean
}

export const emptyInput = (): InputCmd => ({
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  fire: false,
  jump: false,
  sprint: false,
  crouch: false,
  hide: false,
  aim: false,
  altFire: false,
  altPress: false,
  altRelease: false,
  slide: false,
  grappleL: false,
  grappleR: false,
  grappleBoost: false,
  abilityF: false,
  abilityT: false,
  reload: false,
  selectSlot: -1,
  cycle: 0,
  style: false,
  melee: false,
  explosiveQuick: false,
  bladeQuick: false,
})
