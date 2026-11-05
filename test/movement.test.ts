import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/sim/match'
import { emptyUpgrades } from '../src/data/upgrades'
import { emptyLoadout } from '../src/sim/player'
import { emptyInput } from '../src/sim/types'
import {
  fireGrapple,
  releaseGrapple,
  stepMovement,
  GRAVITY,
  GROUND_SPEED,
  JUMP_HEIGHT,
  DOUBLE_JUMP_HEIGHT_SCALE,
  SPRINT_SPEED,
} from '../src/sim/movement'
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

  it('jumps out of a slide with speed capped at sprint speed', () => {
    const { world, player } = flatMatch()
    player.pos = { x: 0, y: 0.02, z: 24 }
    player.yaw = 0
    player.vel = { x: 0, y: 0, z: -8.5 }
    stepMovement(world, player, cmd({ moveZ: 1, sprint: true, slide: true }), 1 / 60)
    const before = Math.hypot(player.vel.x, player.vel.z)
    expect(before).toBeGreaterThan(SPRINT_SPEED)
    stepMovement(world, player, cmd({ jump: true, sprint: true }), 1 / 60)
    expect(player.sliding).toBe(false)
    expect(player.vel.y).toBeGreaterThan(0)
    expect(Math.hypot(player.vel.x, player.vel.z)).toBeLessThanOrEqual(
      SPRINT_SPEED * player.stats.speedMult + 1e-6,
    )
  })

  it('locks the slide direction at the moment it starts', () => {
    const { world, player } = flatMatch()
    // Land on the floor before sliding so the slide isn't cancelled as airborne.
    player.onGround = false
    for (let i = 0; i < 120 && !player.onGround; i++) {
      stepMovement(world, player, cmd({}), 1 / 60)
    }
    expect(player.onGround).toBe(true)
    player.yaw = 0
    player.vel = { x: 0, y: 0, z: -8.5 }
    stepMovement(world, player, cmd({ moveZ: 1, sprint: true, slide: true }), 1 / 60)
    expect(player.sliding).toBe(true)
    const dirZ = player.vel.z / Math.hypot(player.vel.x, player.vel.z)
    for (let i = 0; i < 20; i++) {
      stepMovement(world, player, cmd({ moveX: 1, moveZ: 1, sprint: true }), 1 / 60)
    }
    expect(player.sliding).toBe(true)
    expect(Math.abs(player.vel.x)).toBeLessThan(0.001)
    expect(player.vel.z / Math.hypot(player.vel.x, player.vel.z)).toBeCloseTo(dirZ, 5)
  })

  it('turns a slide into a crouch when crouch is pressed again', () => {
    const { world, player } = flatMatch()
    player.pos = { x: 0, y: 0.02, z: 24 }
    player.yaw = 0
    player.vel = { x: 0, y: 0, z: -8.5 }
    stepMovement(world, player, cmd({ moveZ: 1, sprint: true, slide: true }), 1 / 60)
    expect(player.sliding).toBe(true)
    stepMovement(world, player, cmd({ crouch: true, slide: true }), 1 / 60)
    expect(player.sliding).toBe(false)
    expect(player.crouching).toBe(true)
  })

  it('caps airborne speed at the ground speed of the current stance', () => {
    const sprintJump = flatMatch()
    sprintJump.player.vel = { x: 0, y: 0, z: -SPRINT_SPEED }
    stepMovement(sprintJump.world, sprintJump.player, cmd({ moveZ: 1, sprint: true, jump: true }), 1 / 60)
    sprintJump.player.onGround = false
    for (let i = 0; i < 60; i++) {
      stepMovement(sprintJump.world, sprintJump.player, cmd({ moveZ: 1, sprint: true }), 1 / 60)
    }
    const sprintAir = Math.hypot(sprintJump.player.vel.x, sprintJump.player.vel.z)
    expect(sprintAir).toBeLessThanOrEqual(SPRINT_SPEED * sprintJump.player.stats.speedMult + 1e-6)

    const walkJump = flatMatch()
    walkJump.player.vel = { x: 0, y: 0, z: -GROUND_SPEED }
    stepMovement(walkJump.world, walkJump.player, cmd({ moveZ: 1, jump: true }), 1 / 60)
    walkJump.player.onGround = false
    for (let i = 0; i < 60; i++) {
      stepMovement(walkJump.world, walkJump.player, cmd({ moveZ: 1 }), 1 / 60)
    }
    const walkAir = Math.hypot(walkJump.player.vel.x, walkJump.player.vel.z)
    expect(walkAir).toBeLessThanOrEqual(GROUND_SPEED * walkJump.player.stats.speedMult + 1e-6)
    expect(sprintAir).toBeGreaterThan(walkAir)
  })

  it('applies the Exposed movement penalty', () => {
    const normal = flatMatch()
    const exposed = flatMatch()
    exposed.world.time = 1
    exposed.player.exposedUntil = 6
    stepMovement(normal.world, normal.player, cmd({ moveZ: 1 }), 1 / 60)
    stepMovement(exposed.world, exposed.player, cmd({ moveZ: 1 }), 1 / 60)
    expect(Math.hypot(exposed.player.vel.x, exposed.player.vel.z)).toBeCloseTo(
      Math.hypot(normal.player.vel.x, normal.player.vel.z) * 0.8,
      4,
    )
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

  it('attaches grapples to geometry and keeps them latched while held', () => {
    const { world, player } = flatMatch()
    expect(player.stats.grappleRange).toBeGreaterThan(110)
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
    expect(player.grapples[1].active).toBe(true)
  })

  it('auto-attaches when the crosshair is just off a surface', () => {
    const { world, player } = flatMatch()
    world.colliders = [{ min: { x: -0.25, y: 0, z: 0 }, max: { x: 0.25, y: 20, z: 2 } }]
    player.pos = { x: 0, y: 2, z: 12 }
    player.pitch = 0
    player.yaw = 0.04
    expect(fireGrapple(world, player, 1)).toBe(true)
  })

  it('tightens the swing radius to the closest distance reached', () => {
    const { world, player } = flatMatch()
    player.pos = { x: 0, y: 10, z: 12 }
    player.vel = { x: 0, y: 0, z: 0 }
    player.onGround = false
    player.grapples[1].active = true
    player.grapples[1].anchor = { x: 0, y: 20, z: 0 }
    player.grapples[1].length = 20
    stepMovement(world, player, cmd({ grappleR: true }), 1 / 60)
    expect(player.grapples[1].active).toBe(true)
    expect(player.grapples[1].length).toBeLessThan(16)
  })

  it('re-fires a grapple without waiting on a cooldown', () => {
    const { world, player } = flatMatch()
    player.pos = { x: 0, y: 0.02, z: 24 }
    player.yaw = 0
    player.pitch = 0
    expect(fireGrapple(world, player, 1)).toBe(true)
    releaseGrapple(world, player, 1, false)
    expect(fireGrapple(world, player, 1)).toBe(true)
  })

  it('refuses to attach a grapple when nothing is in range', () => {
    const { world, player } = flatMatch()
    player.pos = { x: 0, y: 60, z: 0 }
    player.pitch = Math.PI / 2 - 0.001
    const fired = fireGrapple(world, player, 0)
    expect(fired).toBe(false)
    expect(player.grapples[0].active).toBe(false)
  })

  it('uses the held jump key to reel in grapple hooks and drains a five-second boost', () => {
    const { world, player } = flatMatch()
    player.pos = { x: 0, y: 100, z: 20 }
    player.onGround = false
    player.grapples[1].active = true
    player.grapples[1].anchor = { x: 0, y: 100, z: 0 }
    player.grapples[1].length = 20

    for (let i = 0; i < 300; i++) {
      stepMovement(
        world,
        player,
        cmd({ jump: true, grappleR: true, grappleBoost: true }),
        1 / 60,
      )
    }
    expect(player.grappleBoostFuel).toBeCloseTo(0, 5)
    expect(player.grappleBoosting).toBe(false)
    expect(player.grapples[1].length).toBe(1.5)

    for (let i = 0; i < 300; i++) {
      stepMovement(world, player, cmd({ grappleR: true }), 1 / 60)
    }
    expect(player.grappleBoostFuel).toBeCloseTo(5, 5)
  })

  it('boost launches from the ground and pulls harder than a normal swing', () => {
    const regular = flatMatch()
    const boosted = flatMatch()
    for (const { player } of [regular, boosted]) {
      player.grapples[1].active = true
      player.grapples[1].anchor = { x: 0, y: 12, z: 0 }
      player.grapples[1].length = 5
    }

    stepMovement(regular.world, regular.player, cmd({ grappleR: true }), 1 / 60)
    stepMovement(
      boosted.world,
      boosted.player,
      cmd({ grappleR: true, grappleBoost: true }),
      1 / 60,
    )

    expect(boosted.player.pos.y).toBeGreaterThan(regular.player.pos.y)
    expect(boosted.player.vel.y).toBeGreaterThan(9)
    expect(Math.hypot(boosted.player.vel.x, boosted.player.vel.z)).toBeGreaterThan(
      Math.hypot(regular.player.vel.x, regular.player.vel.z),
    )
  })

  it('does not let grapple-speed movement tunnel through buildings', () => {
    const { world, player } = flatMatch()
    world.colliders = [
      {
        min: { x: 1, y: 0, z: -2 },
        max: { x: 2, y: 10, z: 2 },
      },
    ]
    player.pos = { x: 0, y: 2, z: 0 }
    player.vel = { x: 80, y: 0, z: 0 }
    player.onGround = false
    player.grapples[1].active = true
    player.grapples[1].anchor = { x: 10, y: 2, z: 0 }
    player.grapples[1].length = 1

    stepMovement(world, player, cmd({ grappleR: true, grappleBoost: true }), 0.1)

    expect(player.pos.x).toBeLessThanOrEqual(0.601)
    expect(player.pos.x + 0.4).toBeLessThanOrEqual(1.001)
  })

  it('balances opposite anchors without drifting', () => {
    const balanced = flatMatch()
    balanced.player.pos = { x: 0, y: 20, z: 20 }
    balanced.player.onGround = false
    balanced.player.grapples[0].active = true
    balanced.player.grapples[0].anchor = { x: -10, y: 20, z: 20 }
    balanced.player.grapples[0].length = 9.5
    balanced.player.grapples[1].active = true
    balanced.player.grapples[1].anchor = { x: 10, y: 20, z: 20 }
    balanced.player.grapples[1].length = 9.5
    for (let i = 0; i < 60; i++) {
      stepMovement(
        balanced.world,
        balanced.player,
        cmd({ grappleL: true, grappleR: true }),
        1 / 60,
      )
    }
    expect(Math.abs(balanced.player.vel.x)).toBeLessThan(0.1)
    expect(Math.abs(balanced.player.pos.x)).toBeLessThan(0.1)
  })
})
