import type { Player, World } from './types'

export const TEAM_NAMES = ['ALPHA', 'BRAVO'] as const

export function isTeamMode(world: World): boolean {
  return world.match.mode === 'tdm'
}

/** True when two different players share a team in a team mode. */
export function friendly(world: World, a: Player, b: Player): boolean {
  return isTeamMode(world) && a.id !== b.id && a.team === b.team
}

/** Living players that are valid targets for `player`. */
export function enemiesOf(world: World, player: Player): Player[] {
  return world.players.filter((p) => p.alive && p.id !== player.id && !friendly(world, player, p))
}
