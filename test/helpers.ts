import { STAND_HEIGHT } from '../src/sim/collision'
import type { Player } from '../src/sim/types'

/** Put a test player on the ground in a known spot, fully healed. */
export function cleanState(player: Player, pos = { x: 0, y: 0.02, z: 20 }): void {
  player.pos = { ...pos }
  player.vel = { x: 0, y: 0, z: 0 }
  player.health = player.stats.maxHealth
  player.alive = true
  player.onGround = true
  player.height = STAND_HEIGHT
  player.effects = []
  player.exposedUntil = 0
  player.invulnerableUntil = 0
  player.sp = 0
}
