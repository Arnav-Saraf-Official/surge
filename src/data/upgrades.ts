import type { UpgradeDef, UpgradeKey } from './types'

export const MAX_POINTS = 5
export const MAX_PER_CATEGORY = 3

export const UPGRADES: UpgradeDef[] = [
  { key: 'vitality', name: 'Vitality', perPoint: '+10 health' },
  { key: 'agility', name: 'Agility', perPoint: '+4% move speed, +5% slide length' },
  { key: 'dexterity', name: 'Dexterity', perPoint: '+6% reload / swap speed' },
  { key: 'focus', name: 'Focus', perPoint: '+4% cooldown reduction, +3% T charge from damage' },
  { key: 'grapple', name: 'Grapple', perPoint: '+4 m range, -8% grapple cooldown' },
  { key: 'might', name: 'Might', perPoint: '+3% weapon damage' },
]

export type UpgradeSpend = Record<UpgradeKey, number>

export const emptyUpgrades = (): UpgradeSpend => ({
  vitality: 0,
  agility: 0,
  dexterity: 0,
  focus: 0,
  grapple: 0,
  might: 0,
})

export function pointsSpent(u: UpgradeSpend): number {
  return Object.values(u).reduce((a, b) => a + b, 0)
}

export function canSpend(u: UpgradeSpend, key: UpgradeKey): boolean {
  return pointsSpent(u) < MAX_POINTS && u[key] < MAX_PER_CATEGORY
}

export function spendPoint(u: UpgradeSpend, key: UpgradeKey): UpgradeSpend {
  if (!canSpend(u, key)) return u
  return { ...u, [key]: u[key] + 1 }
}

export function refundPoint(u: UpgradeSpend, key: UpgradeKey): UpgradeSpend {
  if (u[key] <= 0) return u
  return { ...u, [key]: u[key] - 1 }
}
