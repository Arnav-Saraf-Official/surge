import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/sim/match'
import { emptyUpgrades } from '../src/data/upgrades'
import { emptyLoadout } from '../src/sim/player'
import { emptyInput } from '../src/sim/types'
import { fireGrapple, stepMovement, GRAVITY, JUMP_HEIGHT, DOUBLE_JUMP_HEIGHT_SCALE } from '../src/sim/movement'
import type { Player, World } from '../src/sim/types'

function flatMatch(): { world: World; player: Player } {
  const loadout = emptyLoadout()
  loadout.slots[0] = 'reaper'
  const world = createWorld({
    mapId: 'hollow-ward',
    loadout,
    upgrades: emptyUpgrades(),
    botCount: 0,
    difficulty: 'normal',
  })
  const player = world.players[0]
  player.pos = { x: 0, y: 0.02, z: 20 }
  player.vel = { x: 0, y: 0, z: 0 }
  player.onGround = true
  return { world, player }
}

function cmd(overrides: Partial<ReturnType<typeof emptyInput>> = {}) {
  return { ...emptyInput(), ...overrides }
}

describe('movement', () => {
  it('starts a slide at sprint speed and decays out of it', () => {
    const { world, player } = flatMatch()
    player.yaw = 0
    player.vel = { x: 0, y: 0, z: -8.5 }
    stepMovement(world, player, cmd({ moveZ: 1, sprint: true, slide: true }), 1 / 60)
    expect(player.sliding).toBe(true)
    const slideSpeed = Math.hypot(player.vel.x, player.vel.z)
    expect(slideSpeed).toBeGreaterThan(9)

    // Slide should end on its own within the 1.2 s window (plus a tick).
    for (let i = 0; i < 90; i++) {
      stepMovement(world, player, cmd({ yaw: 0 }), 1 / 60)
    }
    expect(player.sliding).toBe(false)
  })

  it('keeps slide momentum when jumping out of it', () => {
    const { world, player } = flatMatch()
    player.yaw = 0
    player.vel = { x: 0, y: 0, z: -8.5 }
    stepMovement(world, player, cmd({ moveZ: 1, sprint: true, slide: true }), 1 / 60)
    const before = Math.hypot(player.vel.x, player.vel.z)
    stepMovement(world, player, cmd({ jump: true }), 1 / 60)
    expect(player.sliding).toBe(false)
    expect(Math.hypot(player.vel.x, player.vel.z)).toBeGreaterThan(before * 0.9)
    expect(player.vel.y).toBeGreaterThan(0)
  })

  it('gives one extra jump worth 70% of the first jump height', () => {
    const { world, player } = flatMatch()
    stepMovement(world, player, cmd({ jump: true }), 1 / 60)
    const firstJumpSpeed = player.vel.y + GRAVITY / 60
    expect(firstJumpSpeed).toBeCloseTo(Math.sqrt(2 * GRAVITY * JUMP_HEIGHT), 1)

    stepMovement(world, player, cmd({ jump: true }), 1 / 60)
    expect(player.jumpsUsed).toBe(1)
    const secondJumpSpeed = player.vel.y + GRAVITY / 60
    expect(secondJumpSpeed).toBeCloseTo(Math.sqrt(2 * GRAVITY * JUMP_HEIGHT * DOUBLE_JUMP_HEIGHT_SCALE), 1)

    // A third jump in the air does nothing.
    const before = player.vel.y
    stepMovement(world, player, cmd({ jump: true }), 1 / 60)
    expect(player.vel.y).toBeLessThan(before)
  })

  it('does not let players walk through walls', () => {
    const { world, player } = flatMatch()
    // Face north into the yard wall and sprint for a second.
    player.yaw = 0
    for (let i = 0; i < 240; i++) {
      stepMovement(world, player, cmd({ yaw: 0, moveZ: 1, sprint: true }), 1 / 60)
      stepMovement(world, player, cmd({ yaw: 0, moveZ: 1, sprint: true }), 1 / 60)
    }
    expect(player.pos.z).toBeGreaterThan(-32)
    expect(Number.isFinite(player.pos.x)).toBe(true)
    expect(Number.isFinite(player.pos.y)).toBe(true)
  })

  it('attaches grapples to geometry and pulls the player toward it', () => {
    const { world, player } = flatMatch()
    player.pos = { x: 0, y: 0.02, z: 24 }
    player.yaw = 0
    player.pitch = 0
    const fired = fireGrapple(world, player, 1)
    expect(fired).toBe(true)
    expect(player.grapples[1].active).toBe(true)
    expect(player.grapples[1].anchor.z).toBeLessThan(24)

    for (let i = 0; i < 30; i++) {
      stepMovement(world, player, cmd({ yaw: 0, grappleR: true }), 1 / 60)
    }
    expect(player.pos.z).toBeLessThan(24)
  })

  it('refuses to attach a grapple when nothing is in range', () => {
    const { world, player } = flatMatch()
    player.pos = { x: 0, y: 60, z: 0 }
    player.pitch = Math.PI / 2 - 0.001
    const fired = fireGrapple(world, player, 0)
    expect(fired).toBe(false)
    expect(player.grapples[0].active).toBe(false)
  })
})
