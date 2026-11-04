# SURGE

Movement-heavy browser FPS where your loadout is your class. This repository
contains the **single-player** milestone: a greybox arena, full movement
(slide, double jump, dual grapples), the loadout/upgrade rules, style points,
lethal abilities with Exposed, regen and orbs, and bot FFA on two maps.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + static build into dist/
npm test           # 21 simulation unit tests
npm run smoke      # boots dist/ in headless Chrome and checks the HUD
```

Deploys to Vercel as a static site (`vercel.json`), no server required.

## Architecture

```
src/
  core/        math (vec3, AABB, raycast), seeded RNG
  data/        pure data: weapons + abilities, upgrades, maps
  sim/         deterministic 60 Hz simulation, no DOM and no Three.js
    collision  AABB move-and-slide, auto step-up, world raycasts
    movement   walk/sprint/crouch/slide/double jump/grapple physics
    combat     hitscan, pellets, wall penetration, melee, rockets
    abilities  ability activation, timed effect windows, Lethal Strain
    damage     the single damage entry point (resistance, Exposed, kills)
    style      style point awards, passive cooldown reduction
    bots       bots emit the same `InputCmd` a human does
    match      world creation, fixed-step tick, respawns, orbs, match end
  render/      Three.js renderer + DOM HUD
  ui/          loadout / upgrade / match menu, pause, results
  net/         (next milestone) transport + snapshots
```

The simulation is a pure function of `(World, InputCmd, dt)`. That is deliberate:
`sim/` has no renderer or DOM dependency, so the same code can run inside a
Web Worker for single player and on an authoritative server for multiplayer
without rewriting gameplay.

### Adding content

* **Weapon / ability**: add one entry to `src/data/weapons.ts`. Abilities are
  declarative effect lists (`fireRate`, `dr`, `pierce`, `lethalShot`, …), so most
  new abilities need no engine code. Effects run through `sim/effects.ts`,
  `sim/combat.ts` and `sim/abilities.ts`.
* **Map**: add a `MapDef` to `src/data/maps.ts` (boxes, spawns, orbs, lighting).
* **Upgrade / buff**: `src/data/upgrades.ts` and `deriveStats` in `sim/player.ts`.
* **Tuning**: every number that designers touch lives in `src/data`.

## Rules implemented

* 7 slots, empty-slot buffs (rotating, 2 stacks max), Specialist (1 weapon) and
  Duelist (2 weapons) packages, 5 upgrade points with a 3-per-category cap.
* Slide (momentum, 1.2 s, slide-jump keeps speed, aim and fire allowed),
  double jump at 70% height, independent L/R grapples (hold = swing, tap = zip,
  4 s cooldown, momentum preserved on release).
* F/T abilities per weapon, per-weapon cooldowns that keep ticking when
  holstered, T charge from damage or cooldown, style spends (Z+F Flourish,
  Z+T Overcharge), passive style cooldown reduction.
* Lethal conditions (H/B/P), non-lethal damage caps, Lethal Strain → Exposed,
  wall penetration table with 5+ wall caps.
* Regen after 10 s, regen orbs (+30, 45 s respawn, kills drop +10), respawns.

## Known gaps for the next milestones

* Launch roster is 7 weapons (one per type) with working F/T abilities; the
  remaining 28 and the 10 synergy combos are data additions.
* Bots use steering + line-of-sight, not a baked navmesh, and no grapple routes.
* No audio, no kill cam, no team modes, no co-op waves.
* **Multiplayer is not implemented.** Vercel Functions cannot hold persistent
  sockets, so the plan is host-authoritative WebRTC data channels with the same
  `sim/` code, plus a small signaling endpoint. That server choice is the one
  open decision before netcode work starts.
