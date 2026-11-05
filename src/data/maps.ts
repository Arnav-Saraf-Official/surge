import type { BoxDef, MapDef } from './types'

const box = (
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color?: number,
  kind?: string,
  texture?: string,
): BoxDef => ({ pos: [x, y, z], size: [w, h, d], color, kind, texture })

// Palette constants
const STONE = 0x2c3140
const STONE_LIGHT = 0x3a4152
const FLOOR = 0x1e222c
const METAL = 0x39414d
const RUST = 0x5a4032
const WOOD = 0x543f2f
const BARK = 0x3d2b1f
const FOLIAGE = 0x254722
const FOLIAGE_DARK = 0x183315
const CAR_BODY = 0x3b4d61
const CAR_DARK = 0x242e3a
const CONCRETE = 0x373d49
const ASPHALT = 0x20242c
const HAZARD = 0xca9826
const ROOF_MAT = 0x191c24
const JUNGLE_STONE = 0x323a31
const JUNGLE_FLOOR = 0x1f291c
const MIL_DRAB = 0x3f4536
const MIL_TAN = 0x524b3c
const MIL_METAL = 0x2e343b

function wallWithGaps(
  x: number,
  z: number,
  length: number,
  height: number,
  horizontal: boolean,
  gaps: Array<[number, number]>,
  thickness = 1,
  color = STONE,
  kind = 'wall',
  texture?: string,
): BoxDef[] {
  const out: BoxDef[] = []
  const sorted = [...gaps].sort((a, b) => a[0] - b[0])
  let cursor = -length / 2
  for (const [start, end] of sorted) {
    const segLen = start - cursor
    if (segLen > 0.05) {
      out.push(
        horizontal
          ? box(x + cursor + segLen / 2, height / 2, z, segLen, height, thickness, color, kind, texture)
          : box(x, height / 2, z + cursor + segLen / 2, thickness, height, segLen, color, kind, texture),
      )
    }
    cursor = end
  }
  const tail = length / 2 - cursor
  if (tail > 0.05) {
    out.push(
      horizontal
        ? box(x + cursor + tail / 2, height / 2, z, tail, height, thickness, color, kind, texture)
        : box(x, height / 2, z + cursor + tail / 2, thickness, height, tail, color, kind, texture),
    )
  }
  return out
}

function stairs(
  x: number,
  z: number,
  dir: 'north' | 'south' | 'east' | 'west',
  steps: number,
  width = 3.5,
  rise = 0.45,
  run = 0.8,
  baseY = 0,
  color = METAL,
): BoxDef[] {
  const out: BoxDef[] = []
  for (let i = 0; i < steps; i++) {
    const h = rise * (i + 1)
    const offset = run * (i + 0.5)
    const yCenter = baseY + h / 2
    if (dir === 'north') out.push(box(x, yCenter, z + offset, width, h, run, color, 'steps', 'metal'))
    else if (dir === 'south') out.push(box(x, yCenter, z - offset, width, h, run, color, 'steps', 'metal'))
    else if (dir === 'east') out.push(box(x + offset, yCenter, z, run, h, width, color, 'steps', 'metal'))
    else out.push(box(x - offset, yCenter, z, run, h, width, color, 'steps', 'metal'))
  }
  return out
}

function tree(x: number, z: number, trunkHeight: number, trunkR = 0.9, foliageR = 3.5): BoxDef[] {
  const out: BoxDef[] = []
  // Trunk
  out.push(box(x, trunkHeight / 2, z, trunkR * 2, trunkHeight, trunkR * 2, BARK, 'trunk', 'bark'))
  // Multi-tier canopy foliage
  const topY = trunkHeight
  out.push(box(x, topY + 1.2, z, foliageR * 2.2, 2.4, foliageR * 2.2, FOLIAGE, 'foliage', 'foliage'))
  out.push(box(x, topY + 3.0, z, foliageR * 1.6, 2.0, foliageR * 1.6, FOLIAGE_DARK, 'foliage', 'foliage'))
  out.push(box(x, topY + 4.5, z, foliageR * 1.0, 1.6, foliageR * 1.0, FOLIAGE, 'foliage', 'foliage'))
  return out
}

function car(x: number, z: number, rotY = 0, color = CAR_BODY): BoxDef[] {
  const isRot = Math.abs(rotY) > 0.5
  const len = 4.8
  const wid = 2.4
  const l = isRot ? wid : len
  const w = isRot ? len : wid
  return [
    // Chassis
    box(x, 0.45, z, l, 0.65, w, CAR_DARK, 'car', 'metal'),
    // Cabin
    box(x, 1.15, z, isRot ? wid * 0.9 : len * 0.55, 0.75, isRot ? len * 0.55 : wid * 0.9, color, 'car', 'metal'),
    // Windshield / roof detail
    box(x, 1.6, z, isRot ? wid * 0.7 : len * 0.45, 0.2, isRot ? len * 0.45 : wid * 0.7, 0x1e2632, 'car', 'glass'),
  ]
}

function bush(x: number, z: number, radius = 1.6, height = 1.2): BoxDef[] {
  return [
    box(x, height / 2, z, radius * 2, height, radius * 1.8, FOLIAGE, 'bush', 'foliage'),
    box(x + 0.3, height * 0.6, z - 0.2, radius * 1.5, height * 0.9, radius * 1.4, FOLIAGE_DARK, 'bush', 'foliage'),
  ]
}

function shed(x: number, z: number, w: number, h: number, d: number, color = WOOD): BoxDef[] {
  const wallT = 0.4
  return [
    // Floor
    box(x, 0.1, z, w, 0.2, d, FLOOR, 'floor'),
    // Back wall
    box(x, h / 2, z - d / 2 + wallT / 2, w, h, wallT, color, 'shed', 'woodCrate'),
    // Left wall
    box(x - w / 2 + wallT / 2, h / 2, z, wallT, h, d, color, 'shed', 'woodCrate'),
    // Right wall
    box(x + w / 2 - wallT / 2, h / 2, z, wallT, h, d, color, 'shed', 'woodCrate'),
    // Front wall with doorway
    box(x - w / 3, h / 2, z + d / 2 - wallT / 2, w / 3, h, wallT, color, 'shed', 'woodCrate'),
    box(x + w / 3, h / 2, z + d / 2 - wallT / 2, w / 3, h, wallT, color, 'shed', 'woodCrate'),
    // Roof
    box(x, h + 0.2, z, w + 0.6, 0.4, d + 0.6, METAL, 'roof', 'corrugated'),
  ]
}

// ============================================================================
// MAP 1: HOLLOW WARD (Close combat & sneaking around map, expanded with
// two 3-story buildings, secret sniper rooms, roof cover boxes, courtyard with
// trees, sheds, cars, and bushes)
// ============================================================================
function build3StoryCompound(
  centerX: number,
  centerZ: number,
  w: number,
  d: number,
  isLeftWing: boolean,
): BoxDef[] {
  const out: BoxDef[] = []
  const storyH = 4.2
  const wallT = 0.8
  const halfW = w / 2
  const halfD = d / 2

  // --- Story 1 (y: 0 to 4.2) Ground Floor ---
  // Outer perimeter with courtyard doors
  out.push(
    // North wall
    box(centerX, storyH / 2, centerZ - halfD + wallT / 2, w, storyH, wallT, STONE, 'wall', 'brick'),
    // South wall
    box(centerX, storyH / 2, centerZ + halfD - wallT / 2, w, storyH, wallT, STONE, 'wall', 'brick'),
    // Far outer wall
    box(isLeftWing ? centerX - halfW + wallT / 2 : centerX + halfW - wallT / 2, storyH / 2, centerZ, wallT, storyH, d, STONE, 'wall', 'brick'),
    // Courtyard inner wall with doors
    ...wallWithGaps(
      isLeftWing ? centerX + halfW - wallT / 2 : centerX - halfW + wallT / 2,
      centerZ,
      d,
      storyH,
      false,
      [[-halfD + 6, -halfD + 10], [halfD - 10, halfD - 6]],
      wallT,
      STONE,
      'wall',
      'brick',
    ),
  )

  // Ground floor partitions & patient wards
  out.push(
    box(centerX, storyH / 2, centerZ, w - 8, storyH, wallT, STONE_LIGHT, 'wall', 'concrete'),
    box(centerX - 4, storyH / 2, centerZ - halfD / 2, wallT, storyH, halfD * 0.7, STONE_LIGHT, 'wall', 'concrete'),
    box(centerX + 4, storyH / 2, centerZ + halfD / 2, wallT, storyH, halfD * 0.7, STONE_LIGHT, 'wall', 'concrete'),
    // Staggered partitions form connected rooms and blind-corner corridors.
    ...wallWithGaps(
      centerX - 9,
      centerZ - 10,
      20,
      storyH,
      false,
      [[-7, -3], [3, 7]],
      wallT,
      STONE_LIGHT,
      'wall',
      'concrete',
    ),
    ...wallWithGaps(
      centerX + 9,
      centerZ + 10,
      20,
      storyH,
      false,
      [[-7, -3], [3, 7]],
      wallT,
      STONE_LIGHT,
      'wall',
      'concrete',
    ),
    ...wallWithGaps(
      centerX,
      centerZ - 22,
      w - 12,
      storyH,
      true,
      [[-9, -5], [4, 8]],
      wallT,
      STONE_LIGHT,
      'wall',
      'concrete',
    ),
    ...wallWithGaps(
      centerX,
      centerZ + 22,
      w - 12,
      storyH,
      true,
      [[-9, -5], [4, 8]],
      wallT,
      STONE_LIGHT,
      'wall',
      'concrete',
    ),
    // Reception desks / CQC cover
    box(centerX, 0.6, centerZ - 6, 4.5, 1.2, 1.2, METAL, 'cover', 'metal'),
    box(centerX + 3, 0.6, centerZ + 6, 3.2, 1.2, 1.2, METAL, 'cover', 'metal'),
  )

  // Floor 2 Slab (y: 4.2) with stair cutout
  const stairX = isLeftWing ? centerX - halfW + 6 : centerX + halfW - 6
  const stairZ = centerZ - halfD + 8
  out.push(
    box(centerX, storyH + 0.15, centerZ + 6, w - 1, 0.3, d - 14, FLOOR, 'floor', 'concrete'),
    box(isLeftWing ? centerX + 4 : centerX - 4, storyH + 0.15, centerZ - halfD + 7, halfW + 2, 0.3, 12, FLOOR, 'floor', 'concrete'),
  )

  // Stairs Ground -> Floor 2
  out.push(...stairs(stairX, stairZ, 'north', 8, 3.2, 0.52, 0.9, 0, METAL))

  // --- Story 2 (y: 4.2 to 8.4) Laboratories & Catwalks ---
  const y2 = storyH + storyH / 2
  out.push(
    box(centerX, y2, centerZ - halfD + wallT / 2, w, storyH, wallT, STONE, 'wall', 'brick'),
    box(centerX, y2, centerZ + halfD - wallT / 2, w, storyH, wallT, STONE, 'wall', 'brick'),
    box(isLeftWing ? centerX - halfW + wallT / 2 : centerX + halfW - wallT / 2, y2, centerZ, wallT, storyH, d, STONE, 'wall', 'brick'),
    // Courtyard wall with sniper observation windows
    ...wallWithGaps(
      isLeftWing ? centerX + halfW - wallT / 2 : centerX - halfW + wallT / 2,
      centerZ,
      d,
      storyH,
      false,
      [[-12, -6], [6, 12]],
      wallT,
      STONE_LIGHT,
      'wall',
      'brick',
    ),
    // Story 2 Interior corridors & lab rooms
    box(centerX, y2, centerZ - 2, w - 10, storyH, wallT, STONE_LIGHT, 'wall', 'concrete'),
    box(centerX + (isLeftWing ? 3 : -3), y2, centerZ + 8, wallT, storyH, 12, STONE_LIGHT, 'wall', 'concrete'),
    // Lab tables / computer terminals for cover
    box(centerX - 2, storyH + 0.6, centerZ + 8, 3.5, 1.2, 2.0, METAL, 'cover', 'metal'),
    box(centerX + 4, storyH + 0.6, centerZ - 8, 4.0, 1.2, 1.8, METAL, 'cover', 'metal'),
  )

  // Floor 3 Slab (y: 8.4) with stair cutout
  const stair2X = isLeftWing ? centerX - halfW + 6 : centerX + halfW - 6
  const stair2Z = centerZ + halfD - 8
  out.push(
    box(centerX, storyH * 2 + 0.15, centerZ - 6, w - 1, 0.3, d - 14, FLOOR, 'floor', 'concrete'),
    box(isLeftWing ? centerX + 4 : centerX - 4, storyH * 2 + 0.15, centerZ + halfD - 7, halfW + 2, 0.3, 12, FLOOR, 'floor', 'concrete'),
  )

  // Stairs Floor 2 -> Floor 3
  out.push(...stairs(stair2X, stair2Z, 'south', 8, 3.2, 0.52, 0.9, storyH, METAL))

  // --- Story 3 (y: 8.4 to 12.6) High Security & SECRET SNIPER ROOMS ---
  const y3 = storyH * 2 + storyH / 2
  out.push(
    box(centerX, y3, centerZ - halfD + wallT / 2, w, storyH, wallT, STONE, 'wall', 'brick'),
    box(centerX, y3, centerZ + halfD - wallT / 2, w, storyH, wallT, STONE, 'wall', 'brick'),
    box(isLeftWing ? centerX - halfW + wallT / 2 : centerX + halfW - wallT / 2, y3, centerZ, wallT, storyH, d, STONE, 'wall', 'brick'),
    // Outer facing wall with narrow sniper slits
    ...wallWithGaps(
      isLeftWing ? centerX + halfW - wallT / 2 : centerX - halfW + wallT / 2,
      centerZ,
      d,
      storyH,
      false,
      [[-halfD + 4, -halfD + 7], [-2, 2], [halfD - 7, halfD - 4]],
      wallT,
      STONE,
      'wall',
      'brick',
    ),
  )

  // SECRET SNIPER ROOM: concealed behind a narrow corridor blind-turn
  const secretRoomX = isLeftWing ? centerX + halfW - 6 : centerX - halfW + 6
  const secretRoomZ = centerZ
  out.push(
    // Secret partition concealing the room entrance
    box(secretRoomX, y3, centerZ - 4.5, 8, storyH, wallT, STONE_LIGHT, 'wall', 'concrete'),
    box(secretRoomX, y3, centerZ + 4.5, 8, storyH, wallT, STONE_LIGHT, 'wall', 'concrete'),
    box(secretRoomX + (isLeftWing ? -4 : 4), y3, centerZ - 1, wallT, storyH, 4.5, STONE_LIGHT, 'wall', 'concrete'),
    // Inside the secret room: sniper roost platform and cover sandbags/crates
    box(secretRoomX, storyH * 2 + 0.5, secretRoomZ, 4.5, 1.0, 3.2, METAL, 'roost', 'woodCrate'),
    box(secretRoomX + (isLeftWing ? 2.5 : -2.5), storyH * 2 + 0.65, secretRoomZ, 0.8, 1.3, 2.2, METAL, 'cover', 'metal'),
  )

  // --- ROOF (y: 12.6) with ample boxes, AC units, and hiding spots ---
  const roofY = storyH * 3
  out.push(
    // Roof slab
    box(centerX, roofY + 0.15, centerZ, w + 0.4, 0.3, d + 0.4, ROOF_MAT, 'roof', 'roofGravel'),
    // Roof access stair landing
    ...stairs(stairX, stairZ, 'north', 8, 3.2, 0.52, 0.9, storyH * 2, METAL),
    // Stairwell penthouse enclosure on roof
    box(stairX, roofY + 1.5, stairZ + 3.5, 5.0, 3.0, 6.0, STONE, 'wall', 'concrete'),
    // Parapet walls around roof perimeter (1.2m high for ducking/cover)
    box(centerX, roofY + 0.6, centerZ - halfD, w, 1.2, 0.5, STONE_LIGHT, 'cover', 'concrete'),
    box(centerX, roofY + 0.6, centerZ + halfD, w, 1.2, 0.5, STONE_LIGHT, 'cover', 'concrete'),
    box(centerX - halfW, roofY + 0.6, centerZ, 0.5, 1.2, d, STONE_LIGHT, 'cover', 'concrete'),
    box(centerX + halfW, roofY + 0.6, centerZ, 0.5, 1.2, d, STONE_LIGHT, 'cover', 'concrete'),

    // AMPLE ROOF COVER: Heavy AC chillers, water towers, vent ducts, crate stacks
    box(centerX - 6, roofY + 1.1, centerZ - 8, 4.0, 2.2, 3.5, METAL, 'cover', 'corrugated'),
    box(centerX + 6, roofY + 1.1, centerZ - 12, 3.5, 2.2, 4.0, METAL, 'cover', 'corrugated'),
    box(centerX, roofY + 1.2, centerZ + 6, 5.0, 2.4, 3.0, METAL, 'cover', 'corrugated'),
    box(centerX - 8, roofY + 1.0, centerZ + 12, 3.0, 2.0, 4.5, METAL, 'cover', 'corrugated'),
    box(centerX + 8, roofY + 0.8, centerZ + 8, 4.0, 1.6, 2.8, METAL, 'cover', 'corrugated'),
    // Stacks of wooden crates and ammunition boxes for tactical head-glitch / crouching
    box(centerX + (isLeftWing ? 10 : -10), roofY + 0.6, centerZ - 4, 2.0, 1.2, 2.0, WOOD, 'cover', 'woodCrate'),
    box(centerX + (isLeftWing ? 10 : -10), roofY + 0.6, centerZ + 2, 2.2, 1.2, 2.2, WOOD, 'cover', 'woodCrate'),
    box(centerX + (isLeftWing ? 11 : -11), roofY + 1.5, centerZ - 1, 1.6, 0.9, 1.6, WOOD, 'cover', 'woodCrate'),
    box(centerX, roofY + 0.7, centerZ - 18, 3.2, 1.4, 2.0, WOOD, 'cover', 'woodCrate'),
    box(centerX + (isLeftWing ? -8 : 8), roofY + 0.7, centerZ - 16, 2.4, 1.4, 2.4, WOOD, 'cover', 'woodCrate'),
    // High antenna mast / grapple pole
    box(centerX, roofY + 5.0, centerZ, 0.6, 10.0, 0.6, RUST, 'roost', 'metal'),
  )

  return out
}

const wardBoxes: BoxDef[] = [
  // Expanded main ground floor (140 x 140)
  box(0, -0.5, 0, 140, 1, 140, FLOOR, 'floor', 'asphalt'),

  // Compound boundary walls with watch towers
  ...wallWithGaps(0, -68, 140, 10, true, [], 1.5, STONE, 'wall', 'brick'),
  ...wallWithGaps(-68, 0, 140, 10, false, [], 1.5, STONE, 'wall', 'brick'),
  ...wallWithGaps(68, 0, 140, 10, false, [], 1.5, STONE, 'wall', 'brick'),
  ...wallWithGaps(0, 68, 140, 10, true, [], 1.5, STONE, 'wall', 'brick'),

  // TWO MAIN 3-STORY BUILDINGS:
  // Building Alpha (West Wing)
  ...build3StoryCompound(-42, 0, 34, 56, true),
  // Building Bravo (East Wing)
  ...build3StoryCompound(42, 0, 34, 56, false),

  // ========================================================================
  // COURTYARD BETWEEN THE BUILDINGS: Trees, sheds, cars, bushes, barriers
  // ========================================================================
  // Central asphalt road running North-South
  box(0, 0.05, 0, 18, 0.1, 136, ASPHALT, 'floor', 'asphalt'),

  // Abandoned cars & military transport trucks
  ...car(-8, -26, 0.1, CAR_BODY),
  ...car(7, -14, 0.8, 0x5a3434),
  ...car(-6, 8, -0.2, 0x2e4238),
  ...car(9, 28, 0.0, CAR_BODY),
  ...car(-7, 44, 0.7, 0x47392e),
  // Armored personnel carrier in central courtyard
  box(0, 1.2, 0, 4.2, 2.4, 7.5, MIL_DRAB, 'cover', 'metal'),
  box(0, 2.6, 0.5, 2.8, 1.0, 4.0, MIL_DRAB, 'cover', 'metal'),

  // Sheds (storage outbuildings with enterable interiors)
  ...shed(-16, -42, 7.5, 3.8, 5.5, WOOD),
  ...shed(16, -42, 7.5, 3.8, 5.5, WOOD),
  ...shed(-16, 42, 7.5, 3.8, 5.5, WOOD),
  ...shed(16, 42, 7.5, 3.8, 5.5, WOOD),

  // Trees with climbable & grapple-ready canopies
  ...tree(-14, -18, 10, 0.8, 3.8),
  ...tree(14, -28, 11, 0.9, 4.0),
  ...tree(-15, 22, 10.5, 0.8, 3.8),
  ...tree(15, 14, 11, 0.9, 4.0),
  ...tree(-13, -54, 9, 0.7, 3.5),
  ...tree(13, 54, 9.5, 0.7, 3.6),
  ...tree(0, -56, 12, 1.0, 4.2),
  ...tree(0, 56, 12, 1.0, 4.2),

  // Dense bush clusters for sneaking and concealment
  ...bush(-5, -34, 1.8, 1.4),
  ...bush(6, -38, 2.0, 1.3),
  ...bush(-8, -4, 2.2, 1.5),
  ...bush(7, 2, 2.1, 1.4),
  ...bush(-6, 20, 2.0, 1.4),
  ...bush(8, -8, 1.9, 1.3),
  ...bush(-4, 36, 2.2, 1.4),
  ...bush(5, 46, 2.0, 1.3),

  // Courtyard concrete barricades and supply container stacks
  box(-12, 0.8, -2, 6.0, 1.6, 1.2, CONCRETE, 'cover', 'concrete'),
  box(12, 0.8, 4, 6.0, 1.6, 1.2, CONCRETE, 'cover', 'concrete'),
  box(-4, 1.3, -16, 3.0, 2.6, 6.0, 0x1f364d, 'cover', 'corrugated'),
  box(4, 1.3, 18, 3.0, 2.6, 6.0, 0x4d281f, 'cover', 'corrugated'),
]

// ============================================================================
// MAP 2: SKYFOUNDRY / VERDANT CANOPY (Emphasis on grappling hook, sniping,
// and high movement. Many tall jungle trees up to 38m, high canopy perches,
// central stone labyrinth maze for sneaking & setting mines, vine swing arches)
// ============================================================================
function buildJungleMaze(centerX: number, centerZ: number, size: number, wallH: number): BoxDef[] {
  const out: BoxDef[] = []
  const half = size / 2
  const t = 1.0
  const color = JUNGLE_STONE

  // Maze outer boundary with 4 entry gates
  out.push(
    // North wall with gate
    ...wallWithGaps(centerX, centerZ - half, size, wallH, true, [[-4, 4]], t, color, 'maze', 'brick'),
    // South wall with gate
    ...wallWithGaps(centerX, centerZ + half, size, wallH, true, [[-4, 4]], t, color, 'maze', 'brick'),
    // West wall with gate
    ...wallWithGaps(centerX - half, centerZ, size, wallH, false, [[-4, 4]], t, color, 'maze', 'brick'),
    // East wall with gate
    ...wallWithGaps(centerX + half, centerZ, size, wallH, false, [[-4, 4]], t, color, 'maze', 'brick'),
  )

  // Internal labyrinth walls, blind corners, alcoves to hide and place mines
  const innerWalls: Array<{ x: number; z: number; w: number; d: number }> = [
    // Center monument / altar
    { x: centerX, z: centerZ, w: 6, d: 6 },
    // Concentric labyrinth rings & dead-ends
    { x: centerX - 8, z: centerZ - 6, w: 10, d: t },
    { x: centerX + 8, z: centerZ - 6, w: 10, d: t },
    { x: centerX - 8, z: centerZ + 6, w: 10, d: t },
    { x: centerX + 8, z: centerZ + 6, w: 10, d: t },
    { x: centerX - 6, z: centerZ, w: t, d: 8 },
    { x: centerX + 6, z: centerZ, w: t, d: 8 },
    // Outer maze rings
    { x: centerX - 14, z: centerZ - 10, w: 8, d: t },
    { x: centerX + 14, z: centerZ - 10, w: 8, d: t },
    { x: centerX - 14, z: centerZ + 10, w: 8, d: t },
    { x: centerX + 14, z: centerZ + 10, w: 8, d: t },
    { x: centerX - 12, z: centerZ - 2, w: t, d: 12 },
    { x: centerX + 12, z: centerZ + 2, w: t, d: 12 },
    { x: centerX - 15, z: centerZ + 4, w: 6, d: t },
    { x: centerX + 15, z: centerZ - 4, w: 6, d: t },
  ]
  for (const w of innerWalls) {
    out.push(box(w.x, wallH / 2, w.z, w.w, wallH, w.d, color, 'maze', 'brick'))
  }
  // Ancient stone monoliths in the maze
  out.push(
    box(centerX - 4, 3.0, centerZ - 4, 1.8, 6.0, 1.8, 0x414f40, 'monolith', 'concrete'),
    box(centerX + 4, 3.0, centerZ + 4, 1.8, 6.0, 1.8, 0x414f40, 'monolith', 'concrete'),
    box(centerX - 4, 3.0, centerZ + 4, 1.8, 6.0, 1.8, 0x414f40, 'monolith', 'concrete'),
    box(centerX + 4, 3.0, centerZ - 4, 1.8, 6.0, 1.8, 0x414f40, 'monolith', 'concrete'),
  )
  return out
}

function buildGiantJungleTree(
  x: number,
  z: number,
  trunkH: number,
  trunkR = 1.4,
): BoxDef[] {
  const out: BoxDef[] = []
  // Massive trunk
  out.push(box(x, trunkH / 2, z, trunkR * 2, trunkH, trunkR * 2, BARK, 'trunk', 'bark'))

  // Mid canopy platform (y: ~14m - 18m)
  const midY = trunkH * 0.5
  out.push(
    box(x, midY, z, 7.5, 0.6, 7.5, WOOD, 'treePlatform', 'woodCrate'),
    box(x + 2.5, midY + 0.6, z, 1.2, 1.2, 1.2, WOOD, 'cover', 'woodCrate'),
    box(x - 2.5, midY + 0.6, z, 1.2, 1.2, 1.2, WOOD, 'cover', 'woodCrate'),
    box(x, midY + 1.2, z, 12.0, 2.0, 12.0, FOLIAGE, 'foliage', 'foliage'),
  )

  // High canopy roost platform (y: ~26m - 34m)
  const highY = trunkH * 0.85
  out.push(
    box(x, highY, z, 8.5, 0.6, 8.5, WOOD, 'treePlatform', 'woodCrate'),
    box(x, highY + 0.7, z + 3.0, 3.5, 1.4, 0.8, WOOD, 'cover', 'woodCrate'),
    box(x, highY + 0.7, z - 3.0, 3.5, 1.4, 0.8, WOOD, 'cover', 'woodCrate'),
    box(x, highY + 1.5, z, 15.0, 2.5, 15.0, FOLIAGE, 'foliage', 'foliage'),
    // Crown foliage
    box(x, trunkH + 2.5, z, 10.0, 5.0, 10.0, FOLIAGE_DARK, 'foliage', 'foliage'),
    // Grapple anchor spire pointing up
    box(x, trunkH + 6.0, z, 0.6, 8.0, 0.6, RUST, 'roost', 'metal'),
  )
  return out
}

const foundryBoxes: BoxDef[] = [
  // Expanded jungle floor (160 x 160)
  box(0, -0.5, 0, 160, 1, 160, JUNGLE_FLOOR, 'floor', 'ground'),

  // Surrounding ancient cliff walls
  ...wallWithGaps(0, -79, 160, 24, true, [], 2.0, JUNGLE_STONE, 'wall', 'cliff'),
  ...wallWithGaps(-79, 0, 160, 24, false, [], 2.0, JUNGLE_STONE, 'wall', 'cliff'),
  ...wallWithGaps(79, 0, 160, 24, false, [], 2.0, JUNGLE_STONE, 'wall', 'cliff'),
  ...wallWithGaps(0, 79, 160, 24, true, [], 2.0, JUNGLE_STONE, 'wall', 'cliff'),

  // CENTRAL ANCIENT STONE LABYRINTH MAZE (36 x 36)
  ...buildJungleMaze(0, 0, 36, 4.2),

  // GIANT TALL JUNGLE TREES WITH HIGH CANOPY PLATFORMS (20 trees around the basin)
  ...buildGiantJungleTree(-32, -32, 34, 1.5),
  ...buildGiantJungleTree(32, -32, 36, 1.5),
  ...buildGiantJungleTree(-32, 32, 35, 1.5),
  ...buildGiantJungleTree(32, 32, 38, 1.6),

  ...buildGiantJungleTree(-55, 0, 32, 1.4),
  ...buildGiantJungleTree(55, 0, 33, 1.4),
  ...buildGiantJungleTree(0, -55, 36, 1.5),
  ...buildGiantJungleTree(0, 55, 34, 1.5),

  ...buildGiantJungleTree(-56, -56, 30, 1.3),
  ...buildGiantJungleTree(56, -56, 32, 1.4),
  ...buildGiantJungleTree(-56, 56, 31, 1.3),
  ...buildGiantJungleTree(56, 56, 33, 1.4),

  ...buildGiantJungleTree(-22, -58, 28, 1.2),
  ...buildGiantJungleTree(22, -58, 29, 1.2),
  ...buildGiantJungleTree(-22, 58, 28, 1.2),
  ...buildGiantJungleTree(22, 58, 30, 1.3),

  ...buildGiantJungleTree(-58, -22, 28, 1.2),
  ...buildGiantJungleTree(58, -22, 29, 1.2),
  ...buildGiantJungleTree(-58, 22, 28, 1.2),
  ...buildGiantJungleTree(58, 22, 30, 1.3),

  // HIGH SUSPENSION BRIDGES & VINE ARCHES FOR SWINGING & GRAPPLING
  // Catwalk bridge linking high trees at y = 17m
  box(0, 17, -32, 60, 0.4, 2.5, WOOD, 'catwalk', 'woodCrate'),
  box(0, 17, 32, 60, 0.4, 2.5, WOOD, 'catwalk', 'woodCrate'),
  box(-32, 17, 0, 2.5, 0.4, 60, WOOD, 'catwalk', 'woodCrate'),
  box(32, 17, 0, 2.5, 0.4, 60, WOOD, 'catwalk', 'woodCrate'),

  // Super-high grapple vine beams (y = 28m)
  box(0, 28, 0, 70, 0.8, 0.8, RUST, 'roost', 'bark'),
  box(0, 28, 0, 0.8, 0.8, 70, RUST, 'roost', 'bark'),

  // Ancient Ruin Pillars & Grapple Spikes around the jungle floor
  box(-24, 6, -16, 2.2, 12, 2.2, JUNGLE_STONE, 'roost', 'concrete'),
  box(24, 6, -16, 2.2, 12, 2.2, JUNGLE_STONE, 'roost', 'concrete'),
  box(-24, 6, 16, 2.2, 12, 2.2, JUNGLE_STONE, 'roost', 'concrete'),
  box(24, 6, 16, 2.2, 12, 2.2, JUNGLE_STONE, 'roost', 'concrete'),

  // Ruin arches over ground corridors
  box(-36, 4.5, 0, 1.5, 9, 8, JUNGLE_STONE, 'wall', 'brick'),
  box(36, 4.5, 0, 1.5, 9, 8, JUNGLE_STONE, 'wall', 'brick'),
]

// ============================================================================
// MAP 3: MILITARY OUTPOST (Mixed map: watch towers for grappling, overhead
// flying planes to grapple onto and ride, 2 large ground buildings, surrounded
// by multiple small buildings: hangars, restaurant/diner, supply shops, garages)
// ============================================================================
function buildWatchTower(x: number, z: number, towerH = 22): BoxDef[] {
  const out: BoxDef[] = []
  const legW = 0.8
  const halfSpan = 3.5

  // 4 corner support pillars
  out.push(
    box(x - halfSpan, towerH / 2, z - halfSpan, legW, towerH, legW, MIL_METAL, 'tower', 'metal'),
    box(x + halfSpan, towerH / 2, z - halfSpan, legW, towerH, legW, MIL_METAL, 'tower', 'metal'),
    box(x - halfSpan, towerH / 2, z + halfSpan, legW, towerH, legW, MIL_METAL, 'tower', 'metal'),
    box(x + halfSpan, towerH / 2, z + halfSpan, legW, towerH, legW, MIL_METAL, 'tower', 'metal'),
  )

  // Mid landing (y: 11m)
  out.push(box(x, towerH * 0.5, z, halfSpan * 2 + 1, 0.4, halfSpan * 2 + 1, METAL, 'catwalk', 'metal'))

  // Top sniper cabin platform (y: 22m)
  const topY = towerH
  out.push(
    box(x, topY, z, halfSpan * 2 + 2, 0.4, halfSpan * 2 + 2, METAL, 'roost', 'metal'),
    // Waist-high parapets with sniper firing ports
    box(x, topY + 0.65, z - halfSpan - 0.8, halfSpan * 2 + 1.6, 1.3, 0.4, MIL_DRAB, 'cover', 'metal'),
    box(x, topY + 0.65, z + halfSpan + 0.8, halfSpan * 2 + 1.6, 1.3, 0.4, MIL_DRAB, 'cover', 'metal'),
    box(x - halfSpan - 0.8, topY + 0.65, z, 0.4, 1.3, halfSpan * 2 + 1.6, MIL_DRAB, 'cover', 'metal'),
    box(x + halfSpan + 0.8, topY + 0.65, z, 0.4, 1.3, halfSpan * 2 + 1.6, MIL_DRAB, 'cover', 'metal'),
    // Tower roof canopy
    box(x, topY + 3.2, z, halfSpan * 2 + 2.5, 0.3, halfSpan * 2 + 2.5, MIL_METAL, 'roof', 'corrugated'),
    // High antenna & grapple hook ring
    box(x, topY + 6.5, z, 0.5, 6.5, 0.5, RUST, 'roost', 'metal'),
    box(x, topY + 9.5, z, 2.5, 0.4, 2.5, HAZARD, 'roost', 'hazard'),
  )

  // Climbing staircase
  out.push(...stairs(x - 5.5, z, 'north', 8, 2.4, 0.65, 0.8, 0, METAL))
  out.push(...stairs(x + 5.5, z, 'south', 8, 2.4, 0.65, 0.8, towerH * 0.5, METAL))

  return out
}

function buildFlyingPlane(x: number, y: number, z: number, heading = 0): BoxDef[] {
  const out: BoxDef[] = []
  // Massive heavy military cargo/gunship aircraft cruising in the sky!
  const isX = Math.abs(heading) < 0.5

  const fuseL = 28
  const fuseW = 4.2
  const fuseH = 4.5
  const wingSpan = 38
  const wingChord = 5.5

  // Fuselage
  out.push(
    box(x, y, z, isX ? fuseL : fuseW, fuseH, isX ? fuseW : fuseL, MIL_DRAB, 'plane', 'metal'),
    // Cockpit nose
    box(isX ? x + fuseL / 2 + 2 : x, y + 0.4, isX ? z : z + fuseL / 2 + 2, isX ? 4.0 : 3.4, 3.2, isX ? 3.4 : 4.0, 0x1e2833, 'plane', 'glass'),
    // Wings spanning across (wide walkable & grappleable surface!)
    box(x, y + 0.5, z, isX ? wingChord : wingSpan, 0.6, isX ? wingSpan : wingChord, MIL_DRAB, 'plane', 'metal'),
    // Twin jet engines underneath wings
    box(isX ? x : x - 10, y - 1.5, isX ? z - 10 : z, isX ? 6.0 : 2.5, 2.5, isX ? 2.5 : 6.0, 0x22262d, 'plane', 'corrugated'),
    box(isX ? x : x + 10, y - 1.5, isX ? z + 10 : z, isX ? 6.0 : 2.5, 2.5, isX ? 2.5 : 6.0, 0x22262d, 'plane', 'corrugated'),
    // Tail vertical fin & horizontal stabilizers
    box(isX ? x - fuseL / 2 + 1 : x, y + 3.5, isX ? z : z - fuseL / 2 + 1, isX ? 3.5 : 0.8, 4.5, isX ? 0.8 : 3.5, MIL_DRAB, 'plane', 'metal'),
    box(isX ? x - fuseL / 2 + 1 : x, y + 1.5, isX ? z : z - fuseL / 2 + 1, isX ? 2.5 : 12.0, 0.4, isX ? 12.0 : 2.5, MIL_DRAB, 'plane', 'metal'),
    // Dedicated grapple railings on wings and fuselage for easy hook latching
    box(x, y + 1.2, isX ? z - 12 : z, isX ? 4.0 : 0.5, 0.8, isX ? 0.5 : 4.0, HAZARD, 'roost', 'hazard'),
    box(x, y + 1.2, isX ? z + 12 : z, isX ? 4.0 : 0.5, 0.8, isX ? 0.5 : 4.0, HAZARD, 'roost', 'hazard'),
  )
  return out
}

function buildAircraftHangar(x: number, z: number, w: number, d: number): BoxDef[] {
  const out: BoxDef[] = []
  const h = 8.5
  const t = 0.8
  // Hangar arched shell: back wall, side walls, roof, front wide open
  out.push(
    // Floor
    box(x, 0.1, z, w, 0.2, d, CONCRETE, 'floor', 'concrete'),
    // Back wall
    box(x, h / 2, z - d / 2 + t / 2, w, h, t, MIL_DRAB, 'wall', 'corrugated'),
    // Left wall
    box(x - w / 2 + t / 2, h / 2, z, t, h, d, MIL_DRAB, 'wall', 'corrugated'),
    // Right wall
    box(x + w / 2 - t / 2, h / 2, z, t, h, d, MIL_DRAB, 'wall', 'corrugated'),
    // Curved/steep roof
    box(x, h + 0.3, z, w + 1, 0.6, d + 1, MIL_METAL, 'roof', 'corrugated'),
    // Parked fighter drone inside
    box(x, 1.2, z - 2, 7.5, 1.8, 9.5, 0x1f2730, 'cover', 'metal'),
    // Maintenance catwalk inside hangar
    box(x - w / 2 + 3.5, 4.5, z, 5.0, 0.3, d - 4, METAL, 'catwalk', 'metal'),
  )
  return out
}

function buildRestaurantDiner(x: number, z: number, w: number, d: number): BoxDef[] {
  const out: BoxDef[] = []
  const h = 4.2
  const t = 0.6
  out.push(
    // Floor
    box(x, 0.1, z, w, 0.2, d, FLOOR, 'floor', 'concrete'),
    // Walls with door and dining windows
    ...wallWithGaps(x, z - d / 2, w, h, true, [[-4, 4]], t, MIL_TAN, 'wall', 'brick'),
    ...wallWithGaps(x, z + d / 2, w, h, true, [[-w / 4, w / 4]], t, MIL_TAN, 'wall', 'brick'),
    box(x - w / 2, h / 2, z, t, h, d, MIL_TAN, 'wall', 'brick'),
    box(x + w / 2, h / 2, z, t, h, d, MIL_TAN, 'wall', 'brick'),
    // Roof
    box(x, h + 0.2, z, w + 0.8, 0.4, d + 0.8, ROOF_MAT, 'roof', 'roofGravel'),
    // Interior dining counter & kitchen partition
    box(x, h / 2, z - 1, w - 6, h, t, STONE_LIGHT, 'wall', 'concrete'),
    box(x, 0.6, z + 2, w - 4, 1.2, 1.0, WOOD, 'cover', 'woodCrate'),
  )
  return out
}

function buildSupplyShop(x: number, z: number, w: number, d: number): BoxDef[] {
  const out: BoxDef[] = []
  const h = 4.2
  const t = 0.6
  out.push(
    // Floor
    box(x, 0.1, z, w, 0.2, d, FLOOR, 'floor', 'concrete'),
    // Walls
    ...wallWithGaps(x, z + d / 2, w, h, true, [[-2, 2]], t, MIL_DRAB, 'wall', 'concrete'),
    box(x, h / 2, z - d / 2, w, h, t, MIL_DRAB, 'wall', 'concrete'),
    box(x - w / 2, h / 2, z, t, h, d, MIL_DRAB, 'wall', 'concrete'),
    box(x + w / 2, h / 2, z, t, h, d, MIL_DRAB, 'wall', 'concrete'),
    // Roof
    box(x, h + 0.2, z, w + 0.8, 0.4, d + 0.8, ROOF_MAT, 'roof', 'roofGravel'),
    // Supply shelves & ammo racks
    box(x - 3, 1.2, z - 2, 1.2, 2.4, 5.0, METAL, 'cover', 'woodCrate'),
    box(x + 3, 1.2, z - 2, 1.2, 2.4, 5.0, METAL, 'cover', 'woodCrate'),
  )
  return out
}

function buildLargeBaseBuilding(x: number, z: number, w: number, d: number): BoxDef[] {
  const out: BoxDef[] = []
  const storyH = 4.5
  const wallT = 0.8
  const halfW = w / 2
  const halfD = d / 2

  // Story 1: Ground floor with wide tactical entrances
  out.push(
    // Perimeter
    ...wallWithGaps(x, z - halfD, w, storyH, true, [[-4, 4]], wallT, CONCRETE, 'wall', 'concrete'),
    ...wallWithGaps(x, z + halfD, w, storyH, true, [[-4, 4]], wallT, CONCRETE, 'wall', 'concrete'),
    ...wallWithGaps(x - halfW, z, d, storyH, false, [[-5, 5]], wallT, CONCRETE, 'wall', 'concrete'),
    ...wallWithGaps(x + halfW, z, d, storyH, false, [[-5, 5]], wallT, CONCRETE, 'wall', 'concrete'),
    // Internal dividing wall with door
    box(x, storyH / 2, z, w - 8, storyH, wallT, STONE_LIGHT, 'wall', 'concrete'),
    // Tactical CQC cover
    box(x - 5, 0.7, z - 5, 4.0, 1.4, 1.5, METAL, 'cover', 'metal'),
    box(x + 5, 0.7, z + 5, 4.0, 1.4, 1.5, METAL, 'cover', 'metal'),
  )

  // Story 2 Floor Slab
  out.push(
    box(x, storyH + 0.2, z, w - 0.5, 0.4, d - 0.5, FLOOR, 'floor', 'concrete'),
    // Stairs Ground -> Story 2
    ...stairs(x - halfW + 6, z - halfD + 6, 'north', 8, 3.2, 0.56, 0.8, 0, METAL),
  )

  // Story 2 Walls
  const y2 = storyH + storyH / 2
  out.push(
    box(x, y2, z - halfD, w, storyH, wallT, CONCRETE, 'wall', 'concrete'),
    box(x, y2, z + halfD, w, storyH, wallT, CONCRETE, 'wall', 'concrete'),
    ...wallWithGaps(x - halfW, z, d, storyH, false, [[-6, -2], [2, 6]], wallT, CONCRETE, 'wall', 'concrete'),
    ...wallWithGaps(x + halfW, z, d, storyH, false, [[-6, -2], [2, 6]], wallT, CONCRETE, 'wall', 'concrete'),
    // Command briefing console
    box(x, storyH + 0.6, z, 5.0, 1.2, 3.0, METAL, 'cover', 'metal'),
  )

  // Roof with parapet & radar dome
  const roofY = storyH * 2
  out.push(
    box(x, roofY + 0.2, z, w + 0.6, 0.4, d + 0.6, ROOF_MAT, 'roof', 'roofGravel'),
    // Parapet
    box(x, roofY + 0.65, z - halfD, w, 1.3, 0.4, CONCRETE, 'cover', 'concrete'),
    box(x, roofY + 0.65, z + halfD, w, 1.3, 0.4, CONCRETE, 'cover', 'concrete'),
    box(x - halfW, roofY + 0.65, z, 0.4, 1.3, d, CONCRETE, 'cover', 'concrete'),
    box(x + halfW, roofY + 0.65, z, 0.4, 1.3, d, CONCRETE, 'cover', 'concrete'),
    // Roof access stair landing
    ...stairs(x - halfW + 6, z + halfD - 6, 'south', 8, 3.2, 0.56, 0.8, storyH, METAL),
    // Radar dome / comms dish
    box(x, roofY + 2.5, z, 4.5, 4.5, 4.5, 0xd0d8e2, 'roost', 'metal'),
    box(x, roofY + 6.0, z, 0.6, 6.0, 0.6, RUST, 'roost', 'metal'),
    // Roof crate cover
    box(x - 8, roofY + 0.7, z - 4, 3.0, 1.4, 2.5, WOOD, 'cover', 'woodCrate'),
    box(x + 8, roofY + 0.7, z + 4, 3.0, 1.4, 2.5, WOOD, 'cover', 'woodCrate'),
  )
  return out
}

const outpostBoxes: BoxDef[] = [
  // Outpost main tarmac / ground (170 x 170)
  box(0, -0.5, 0, 170, 1, 170, FLOOR, 'floor', 'asphalt'),

  // Perimeter security blast walls
  ...wallWithGaps(0, -84, 170, 8, true, [[-8, 8]], 2.0, CONCRETE, 'wall', 'concrete'),
  ...wallWithGaps(-84, 0, 170, 8, false, [[-8, 8]], 2.0, CONCRETE, 'wall', 'concrete'),
  ...wallWithGaps(84, 0, 170, 8, false, [[-8, 8]], 2.0, CONCRETE, 'wall', 'concrete'),
  ...wallWithGaps(0, 84, 170, 8, true, [[-8, 8]], 2.0, CONCRETE, 'wall', 'concrete'),

  // 4 MILITARY WATCH TOWERS FOR GRAPPLING & SNIPING (height 22m)
  ...buildWatchTower(-55, -55, 22),
  ...buildWatchTower(55, -55, 22),
  ...buildWatchTower(-55, 55, 22),
  ...buildWatchTower(55, 55, 22),

  // OVERHEAD FLYING MILITARY PLANES (Grappleable at high altitude!)
  ...buildFlyingPlane(-15, 34, 10, 0),
  ...buildFlyingPlane(25, 42, -20, 1),

  // 2 LARGE GROUND BUILDINGS
  // Building 1: Operations Command HQ
  ...buildLargeBaseBuilding(-35, 0, 32, 42),
  // Building 2: Heavy Vehicle Depot & Barracks
  ...buildLargeBaseBuilding(35, 0, 32, 42),

  // SURROUNDING SMALL BUILDINGS: Hangars, Restaurant/Diner, Supply Shop, Checkpoints
  // Aircraft Hangar 1 (North-West)
  ...buildAircraftHangar(-45, -45, 24, 22),
  // Aircraft Hangar 2 (North-East)
  ...buildAircraftHangar(45, -45, 24, 22),
  // Outpost Diner / Restaurant (South-West)
  ...buildRestaurantDiner(-45, 45, 18, 14),
  // Supply Shop / Quartermaster Depot (South-East)
  ...buildSupplyShop(45, 45, 16, 14),

  // Helipad in central plaza
  box(0, 0.05, 0, 22, 0.1, 22, CONCRETE, 'floor', 'asphalt'),
  box(0, 0.08, 0, 12, 0.1, 1.2, HAZARD, 'floor', 'hazard'),
  box(0, 0.08, 0, 1.2, 0.1, 12, HAZARD, 'floor', 'hazard'),

  // Fuel storage silos (climbable and grappleable)
  box(-12, 4.5, -35, 6, 9, 6, 0x8a929b, 'cover', 'corrugated'),
  box(12, 4.5, -35, 6, 9, 6, 0x8a929b, 'cover', 'corrugated'),

  // Shipping container stacks and sandbag fortifications
  box(0, 1.3, -24, 12, 2.6, 2.5, 0x274a68, 'cover', 'corrugated'),
  box(0, 1.3, 24, 12, 2.6, 2.5, 0x683227, 'cover', 'corrugated'),
  box(-16, 0.6, 18, 5, 1.2, 1.2, MIL_TAN, 'cover', 'woodCrate'),
  box(16, 0.6, -18, 5, 1.2, 1.2, MIL_TAN, 'cover', 'woodCrate'),
]

export const MAPS: MapDef[] = [
  {
    id: 'hollow-ward',
    name: 'Hollow Ward',
    setting: 'Night infiltration compound with two 3-story buildings and overgrown courtyard',
    blurb: 'Two main 3-story buildings with secret sniper rooms & rooftop cover. Courtyard with trees, sheds, cars, and bushes.',
    sky: 0x87ceeb,
    fog: { color: 0x8ba9c0, near: 25, far: 150 },
    sun: { dir: [-0.4, 1, 0.25], color: 0x9fb8ff, intensity: 0.6 },
    ambient: { color: 0x2b3a55, intensity: 0.6 },
    boxes: wardBoxes,
    bounds: 100,
    terrain: { amplitude: 3.5, seed: 2, flatRadius: 72 },
    spawns: [
      [0, 0.1, 45],
      [42, 0.1, 14],
      [-42, 4.5, -10],
      [42, 4.5, -10],
      [-42, 8.8, 0],
      [42, 8.8, 0],
      [-42, 13.0, 16],
      [42, 13.0, 16],
      [0, 0.1, -30],
      [0, 0.1, 30],
      [-16, 0.1, -42],
      [16, 0.1, 42],
      [-8, 0.1, 8],
      [8, 0.1, -8],
    ],
    orbs: [
      [0, 1, 0],
      [-16, 1, -42],
      [16, 1, 42],
      [-42, 13.2, 0],
      [42, 13.2, 0],
      [-8, 1, 8],
      [8, 1, -8],
      [0, 1, -30],
      [0, 1, 30],
    ],
    hides: [
      { pos: [-14, 0.1, -13], radius: 3.2, cover: 'leaves', label: 'Tree hollow' },
      { pos: [-16, 0.2, -42], radius: 2.8, cover: 'crates', label: 'Storage shed' },
      { pos: [9.5, 0.1, 4], radius: 3.2, cover: 'leaves', label: 'Bush cluster' },
      { pos: [-2, 0.1, 30], radius: 3.4, cover: 'leaves', label: 'Overgrown verge' },
    ],
    killY: -20,
    bestLoadouts: 'Shotguns & blades for room clearing; snipers for 3rd story secret rooms and roof roosts.',
  },
  {
    id: 'skyfoundry',
    name: 'Verdant Canopy',
    setting: 'Dense jungle basin with massive tall trees, high canopies, and an ancient stone maze',
    blurb: 'Tall jungle trees up to 38m with canopy perches & vine arches. Central stone maze for sneaking and mine ambushes.',
    sky: 0x161e14,
    fog: { color: 0x182417, near: 35, far: 170 },
    sun: { dir: [0.5, 1, -0.3], color: 0xffd99b, intensity: 0.75 },
    ambient: { color: 0x3d4d38, intensity: 0.65 },
    boxes: foundryBoxes,
    bounds: 110,
    terrain: { amplitude: 7, seed: 5, flatRadius: 84 },
    spawns: [
      [0, 0.1, -22],
      [-12, 0.1, -12],
      [12, 0.1, 12],
      [-32, 17.4, -32],
      [32, 19.4, 32],
      [-32, 30.2, 32],
      [32, 31.0, -32],
      [0, 17.4, -32],
      [0, 17.4, 32],
      [-55, 0.1, 0],
      [55, 0.1, 0],
      [0, 0.1, -55],
    ],
    orbs: [
      [0, 1.2, -22],
      [0, 17.5, -32],
      [0, 17.5, 32],
      [-32, 17.5, -32],
      [32, 17.5, 32],
      [-32, 28.5, 32],
      [32, 28.5, -32],
      [-55, 1.0, 0],
      [55, 1.0, 0],
    ],
    hides: [
      { pos: [-8, 17.2, -32], radius: 3.4, cover: 'leaves', label: 'Canopy leaves' },
      { pos: [8, 17.2, 32], radius: 3.4, cover: 'leaves', label: 'Canopy leaves' },
      { pos: [-24, 0.1, -12], radius: 3.2, cover: 'leaves', label: 'Fern thicket' },
      { pos: [24, 0.1, 40], radius: 3.2, cover: 'leaves', label: 'Fern thicket' },
      { pos: [-33, 0.1, 0], radius: 3.0, cover: 'crates', label: 'Ruin stores' },
    ],
    killY: -25,
    bestLoadouts: 'Double grapples, high-mobility rifles and snipers in the trees; mines and shotguns in the maze.',
  },
  {
    id: 'military-outpost',
    name: 'Military Outpost',
    setting: 'Fortified airbase with watch towers, overhead flying planes, 2 large command bases, hangars, and diner',
    blurb: 'Grapple to 22m watch towers and planes flying overhead. 2 large bases surrounded by hangars, diner, and supply shops.',
    sky: 0x1a212b,
    fog: { color: 0x222a36, near: 40, far: 180 },
    sun: { dir: [0.6, 0.9, 0.4], color: 0xffe2b8, intensity: 0.8 },
    ambient: { color: 0x3c4652, intensity: 0.6 },
    boxes: outpostBoxes,
    bounds: 120,
    terrain: { amplitude: 4.5, seed: 8, flatRadius: 84 },
    spawns: [
      [0, 0.1, 0],
      [-35, 0.1, 0],
      [35, 0.1, 0],
      [-35, 9.6, 0],
      [35, 9.6, 0],
      [-55, 22.5, -55],
      [55, 22.5, -55],
      [-55, 22.5, 55],
      [55, 22.5, 55],
      [-45, 0.1, 45],
      [45, 0.1, 45],
      [-45, 0.1, -45],
      [45, 0.1, -45],
      [-15, 36.4, 10],
      [25, 44.4, -20],
    ],
    orbs: [
      [0, 1.0, 0],
      [-35, 9.5, 0],
      [35, 9.5, 0],
      [-55, 22.8, -55],
      [55, 22.8, 55],
      [-45, 1.0, 45],
      [45, 1.0, 45],
      [-15, 36.7, 10],
      [25, 44.7, -20],
    ],
    hides: [
      { pos: [-45, 0.2, -37], radius: 3.2, cover: 'crates', label: 'Hangar crates' },
      { pos: [-45, 0.2, 41], radius: 2.8, cover: 'crates', label: 'Diner booth' },
      { pos: [45, 0.2, 42], radius: 2.8, cover: 'crates', label: 'Supply rack' },
      { pos: [0, 0.1, -14], radius: 3.2, cover: 'leaves', label: 'Fuel dump foliage' },
      { pos: [30, 0.1, 12], radius: 3.2, cover: 'crates', label: 'Sandbag blind' },
    ],
    killY: -30,
    bestLoadouts: 'Hybrid loadout: snipers for watchtowers and flying plane drops; assault rifles & shotguns for ground buildings.',
  },
]

const MAP_LAYOUT_SCALE = 1.2
for (const map of MAPS) {
  map.bounds = (map.bounds ?? 120) * MAP_LAYOUT_SCALE
  for (const b of map.boxes) {
    b.pos[0] *= MAP_LAYOUT_SCALE
    b.pos[2] *= MAP_LAYOUT_SCALE
    b.size[0] *= MAP_LAYOUT_SCALE
    b.size[2] *= MAP_LAYOUT_SCALE
  }
  for (const point of [...map.spawns, ...map.orbs]) {
    point[0] *= MAP_LAYOUT_SCALE
    point[2] *= MAP_LAYOUT_SCALE
  }
  for (const hide of map.hides ?? []) {
    hide.pos[0] *= MAP_LAYOUT_SCALE
    hide.pos[2] *= MAP_LAYOUT_SCALE
    hide.radius *= MAP_LAYOUT_SCALE
  }
  if (map.terrain) map.terrain.flatRadius *= MAP_LAYOUT_SCALE
}

export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]))

export function getMap(id: string): MapDef {
  return MAP_BY_ID[id] ?? MAPS[0]
}

/** Height of the smooth, deterministic outer landscape at a world position. */
export function terrainHeight(map: MapDef, x: number, z: number): number {
  const terrain = map.terrain
  if (!terrain) return 0

  const radius = Math.hypot(x, z)
  const edge = (map.bounds ?? 120) * 0.97
  const t = Math.max(0, Math.min(1, (radius - terrain.flatRadius) / Math.max(1, edge - terrain.flatRadius)))
  const blend = t * t * (3 - 2 * t)
  const wave =
    0.5 +
    0.22 * Math.sin(x * 0.045 + terrain.seed) * Math.cos(z * 0.055 - terrain.seed) +
    0.18 * Math.sin((x + z) * 0.025 + terrain.seed * 2)
  return terrain.amplitude * Math.max(0, wave) * blend
}
