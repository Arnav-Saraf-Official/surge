import { clamp } from './core/math'
import { emptyInput } from './sim/types'
import type { InputCmd } from './sim/types'

const SENSITIVITY = 0.0022

/**
 * Raw input capture. Produces the same `InputCmd` the bots and (later) the
 * server consume, so the whole game is driven by one input format.
 */
export class Input {
  yaw = 0
  pitch = 0
  sensitivity = SENSITIVITY
  private keys = new Set<string>()
  private pressed = new Set<string>()
  private mouseDown = false
  private mouseClicked = false
  private wheel = 0
  private canvas: HTMLElement | null = null
  paused = true

  attach(canvas: HTMLElement): void {
    this.canvas = canvas
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('wheel', this.onWheel, { passive: true })
    window.addEventListener('blur', this.onBlur)
  }

  requestLock(): void {
    try {
      const result = this.canvas?.requestPointerLock?.() as unknown
      if (result && typeof (result as Promise<void>).catch === 'function') {
        ;(result as Promise<void>).catch(() => {})
      }
    } catch {
      /* pointer lock can be refused (headless, iframe, no user gesture) */
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space') e.preventDefault()
    if (!this.keys.has(e.code)) this.pressed.add(e.code)
    this.keys.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private onBlur = () => {
    this.keys.clear()
    this.mouseDown = false
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.paused) return
    this.yaw -= e.movementX * this.sensitivity
    this.pitch = clamp(this.pitch - e.movementY * this.sensitivity, -1.45, 1.45)
  }

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      this.mouseDown = true
      this.mouseClicked = true
    }
  }

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.locked || this.paused) return
    this.wheel += Math.sign(e.deltaY)
  }

  private held(code: string): boolean {
    return this.keys.has(code)
  }

  private tapped(code: string): boolean {
    return this.pressed.has(code)
  }

  resetAim(yaw: number, pitch: number): void {
    this.yaw = yaw
    this.pitch = pitch
  }

  /** Build a command for one simulation tick and clear edge-triggered inputs. */
  sample(): InputCmd {
    const cmd = emptyInput()
    cmd.yaw = this.yaw
    cmd.pitch = this.pitch

    const forward = (this.held('KeyW') ? 1 : 0) - (this.held('KeyS') ? 1 : 0)
    const strafe = (this.held('KeyD') ? 1 : 0) - (this.held('KeyA') ? 1 : 0)
    cmd.moveZ = forward
    cmd.moveX = strafe
    cmd.sprint = this.held('ShiftLeft') || this.held('ShiftRight')
    cmd.crouch = this.held('KeyC')
    cmd.slide = this.tapped('KeyC') && cmd.sprint
    cmd.jump = this.tapped('Space')
    cmd.fire = this.mouseDown
    cmd.grappleL = this.held('KeyQ')
    cmd.grappleR = this.held('KeyE')
    cmd.abilityF = this.tapped('KeyF')
    cmd.abilityT = this.tapped('KeyT')
    cmd.style = this.held('KeyZ')
    cmd.bladeQuick = this.tapped('KeyV')
    cmd.explosiveQuick = this.tapped('KeyG')
    cmd.reload = this.tapped('KeyR')
    cmd.cycle = clamp(this.wheel, -3, 3)
    this.wheel = 0

    for (let i = 0; i < 7; i++) {
      if (this.tapped(`Digit${i + 1}`)) cmd.selectSlot = i
    }

    this.pressed.clear()
    this.mouseClicked = false
    return cmd
  }

  /** True once per physical click, used to grab pointer lock without firing. */
  consumeClick(): boolean {
    const clicked = this.mouseClicked
    this.mouseClicked = false
    return clicked
  }

  isHeld(code: string): boolean {
    return this.held(code)
  }
}
