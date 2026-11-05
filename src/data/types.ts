/**
 * Data-layer type definitions. Everything in `src/data` is pure data so that
 * designers can add weapons, abilities, upgrades and maps without touching the
 * simulation. The simulation reads these types; the renderer never does.
 */

export type WeaponType = 'rifle' | 'shotgun' | 'auto' | 'pistol' | 'sniper' | 'blade' | 'explosive'

export const WEAPON_TYPES: WeaponType[] = ['rifle', 'shotgun', 'auto', 'pistol', 'sniper', 'blade', 'explosive']

export const WEAPON_TYPE_LABEL: Record<WeaponType, string> = {
  rifle: 'Rifles',
  shotgun: 'Shotguns',
  auto: 'Auto',
  pistol: 'Pistols',
  sniper: 'Snipers',
  blade: 'Blades',
  explosive: 'Explosives',
}

export type Tag = 'Offense' | 'Defense' | 'Utility' | 'Heal'

/** Instakill skill conditions (5.5). */
export type Condition = 'H' | 'B' | 'P' | 'M'

export const CONDITION_LABEL: Record<Condition, string> = {
  H: 'headshot',
  B: 'backstab',
  P: 'point-blank',
  M: 'marked target',
}

export type FireMode = 'auto' | 'semi' | 'bolt' | 'melee' | 'projectile'

export interface FireSpec {
  mode: FireMode
  /** Rounds per minute. */
  rpm: number
  /** Damage per pellet/bullet before multipliers. */
  damage: number
  pellets: number
  /** Cone half-angle in radians at full accuracy. */
  spread: number
  range: number
  magazine: number
  reload: number
  headshotMult: number
  projectileSpeed?: number
  /** Melee reach in metres. */
  meleeReach?: number
  /** Rockets / grenades splash radius. */
  splashRadius?: number
  /** Pellets that must connect for a `P` lethal blast. */
  lethalPellets?: number
}

/**
 * Ability effects are declarative. Adding a new ability usually means adding
 * one data entry, not code. Effects are either timed (applied while the ability
 * is active) or instant (applied once on activation).
 */
export type Effect =
  | { kind: 'fireRate'; mult: number }
  | { kind: 'damage'; mult: number }
  | { kind: 'nextShot' }
  | { kind: 'quickScope'; angleDeg: number; rangeMult: number }
  | { kind: 'accuracy'; mult: number }
  | { kind: 'noRecoil' }
  | { kind: 'speed'; mult: number }
  | { kind: 'dr'; amount: number }
  | { kind: 'healOnDamage'; frac: number }
  | { kind: 'reveal'; radius: number }
  | { kind: 'infAmmo' }
  | { kind: 'noReload' }
  | { kind: 'pierce'; extraWalls: number }
  | { kind: 'explosiveRounds'; radius: number; mult: number }
  | { kind: 'healOverTime'; total: number }
  | { kind: 'lethalShot'; condition: Condition; bodyshotMult: number }
  | { kind: 'lethalMelee'; condition: Condition }
  | { kind: 'invisible'; shimmerRadius: number }
  | { kind: 'lifesteal'; frac: number }
  | { kind: 'slowTargets'; mult: number; duration: number; radius: number }
  | { kind: 'guided' }
  | { kind: 'cluster' }
  | { kind: 'deploy' }
  | { kind: 'shield'; radius: number }
  | { kind: 'dash'; distance: number }
  | { kind: 'knockback'; radius: number; force: number }
  | { kind: 'shotgunSwing'; radius: number; damageFraction: number }
  | { kind: 'phantomSight' }

/** Timed effect kinds. Others fire once when the ability is activated. */
export const TIMED_EFFECTS = new Set<Effect['kind']>([
  'fireRate',
  'damage',
  'nextShot',
  'quickScope',
  'accuracy',
  'noRecoil',
  'speed',
  'dr',
  'healOnDamage',
  'reveal',
  'infAmmo',
  'noReload',
  'pierce',
  'explosiveRounds',
  'healOverTime',
  'lethalShot',
  'lethalMelee',
  'invisible',
  'lifesteal',
  'slowTargets',
  'guided',
  'cluster',
  'shield',
  'phantomSight',
])

export interface AbilityDef {
  id: string
  name: string
  slot: 'F' | 'T'
  tags: Tag[]
  /** Seconds. T abilities also charge from damage, whichever comes first. */
  cooldown: number
  /** Damage threshold that fills the T charge (OP abilities only). */
  charge?: number
  /** Seconds the effect stays active. 0 means an instant, fire-and-forget ability. */
  duration: number
  lethal?: Condition
  effects: Effect[]
  notes?: string
}

export interface WeaponDef {
  id: string
  name: string
  type: WeaponType
  blurb: string
  fire: FireSpec
  f: AbilityDef
  t: AbilityDef
}

export type UpgradeKey = 'vitality' | 'agility' | 'dexterity' | 'focus' | 'grapple' | 'might'

export interface UpgradeDef {
  key: UpgradeKey
  name: string
  perPoint: string
}

export interface BoxDef {
  pos: [number, number, number]
  size: [number, number, number]
  color?: number
  /** Groups boxes for rendering and gameplay tags (e.g. `cover`, `catwalk`). */
  kind?: string
  /** Optional texture key for detailed procedural material binding */
  texture?: string
}

export interface MapDef {
  id: string
  name: string
  setting: string
  blurb: string
  sky: number
  fog: { color: number; near: number; far: number }
  sun: { dir: [number, number, number]; color: number; intensity: number }
  ambient: { color: number; intensity: number }
  boxes: BoxDef[]
  spawns: [number, number, number][]
  orbs: [number, number, number][]
  /** Falling below this Y respawns the player. */
  killY: number
  bestLoadouts: string
  /** Horizontal boundary clamp for the map (half-width). */
  bounds?: number
  /** Smoothly rolling outer terrain; the center stays flat for buildings. */
  terrain?: { amplitude: number; seed: number; flatRadius: number }
}
