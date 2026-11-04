import type { Player } from './types'

export type EffectKind =
  | 'fireRate'
  | 'damage'
  | 'accuracy'
  | 'speed'
  | 'dr'
  | 'lifesteal'
  | 'damageTaken'

/** Product of every multiplier of `kind` across a player's active abilities. */
export function effectMult(player: Player, kind: EffectKind): number {
  let mult = 1
  for (const e of player.effects) {
    for (const eff of e.effects) {
      switch (eff.kind) {
        case 'fireRate':
          if (kind === 'fireRate') mult *= eff.mult
          break
        case 'damage':
          if (kind === 'damage') mult *= eff.mult
          break
        case 'accuracy':
          if (kind === 'accuracy') mult *= eff.mult
          break
        case 'speed':
          if (kind === 'speed') mult *= eff.mult
          break
        case 'lifesteal':
          if (kind === 'lifesteal') mult *= 1 + eff.frac
          break
        default:
          break
      }
    }
  }
  return mult
}

export function hasEffect(player: Player, kind: string): boolean {
  return player.effects.some((e) => e.effects.some((eff) => eff.kind === kind))
}

/** Highest damage resistance currently active (0..0.95). */
export function resistance(player: Player): number {
  let worst = 0
  for (const e of player.effects) {
    for (const eff of e.effects) if (eff.kind === 'dr') worst = Math.max(worst, eff.amount)
  }
  return Math.min(0.95, worst)
}
