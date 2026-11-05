import './styles.css'
import { GameRenderer } from './render/renderer'
import { Hud } from './render/hud'
import { Menu } from './ui/menu'
import { Input } from './input'
import { createWorld, stepWorld } from './sim/match'
import type { World } from './sim/types'

const canvas = document.getElementById('game') as HTMLCanvasElement
const hudRoot = document.getElementById('hud') as HTMLElement
const uiRoot = document.getElementById('ui') as HTMLElement

const renderer = new GameRenderer(canvas)
const hud = new Hud(hudRoot)
const menu = new Menu(uiRoot)
const input = new Input()
input.attach(canvas)

const STEP = 1 / 60
let world: World | null = null
let accumulator = 0
let lastTime = performance.now()
let playing = false
let paused = false
let resultsShown = false
let unpauseGuard = 0

function startMatch(): void {
  world = createWorld({
    mapId: menu.settings.mapId,
    loadout: menu.settings.loadout,
    upgrades: menu.settings.upgrades,
    botCount: menu.settings.botCount,
    difficulty: menu.settings.difficulty,
    mode: menu.settings.mode,
  })
  renderer.setMap(world.map)
  hud.reset(0)
  menu.hide()
  playing = true
  paused = false
  resultsShown = false
  accumulator = 0
  input.paused = false
  input.resetAim(world.players[0].yaw, 0)
  input.requestLock()
}

function pause(): void {
  if (!playing || paused || !world || world.match.ended) return
  paused = true
  input.paused = true
  menu.showPause()
  input.releaseLock()
}

function resume(): void {
  if (!playing) return
  paused = false
  input.paused = false
  menu.hide()
  input.requestLock()
}

function quitToMenu(): void {
  playing = false
  paused = false
  world = null
  input.paused = true
  input.releaseLock()
  hud.reset(0)
}

menu.onStart = () => startMatch()
menu.onResume = () => resume()
menu.onQuit = () => quitToMenu()

document.addEventListener('pointerlockchange', () => {
  if (!input.locked && playing && !paused && !menu.active && performance.now() > unpauseGuard) {
    pause()
  }
})

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (paused) resume()
    else if (playing) pause()
  }
  // X swaps between first-person and the follow camera.
  if (e.code === 'KeyX' && playing && !paused && world) {
    const mode = renderer.toggleCamera()
    hud.showNotice(mode === 'third' ? 'FOLLOW CAMERA' : 'FIRST PERSON', 0.7)
  }
})

canvas.addEventListener('click', () => {
  if (playing && !paused && !input.locked) {
    unpauseGuard = performance.now() + 250
    input.requestLock()
  }
})

function frame(now: number): void {
  const dt = Math.min(0.1, (now - lastTime) / 1000)
  lastTime = now

  if (world && playing && !paused) {
    accumulator += dt
    let steps = 0
    while (accumulator >= STEP && steps < 5) {
      const cmd = input.sample()
      stepWorld(world, cmd, STEP)
      accumulator -= STEP
      steps++
    }
    const local = world.players[0]
    const aimMultiplier = local?.aiming ? 0.45 : 1
    const grappleMultiplier = local?.grapples.every((hook) => hook.active) ? 0.35 : 1
    input.aimSensMult = aimMultiplier * grappleMultiplier

    const events = world.events
    renderer.handleEvents(events, world)
    hud.handleEvents(events, world)
    world.events = []

    renderer.update(world, dt, { yaw: input.yaw, pitch: input.pitch })
    hud.update(world, dt)

    if (world.match.ended && !resultsShown) {
      resultsShown = true
      paused = true
      input.paused = true
      input.releaseLock()
      menu.showResults(world)
    }
  }

  renderer.render()
  requestAnimationFrame(frame)
}

menu.showMain()
requestAnimationFrame(frame)
