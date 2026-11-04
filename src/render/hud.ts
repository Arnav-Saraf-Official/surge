import type { SimEvent, World } from '../sim/types'
import { weapon as weaponDef } from '../data/weapons'
import { abilityStatus } from '../sim/abilities'
import { CONDITION_LABEL } from '../data/types'
import { passiveCdr } from '../sim/style'

interface FeedEntry {
  text: string
  at: number
  headshot: boolean
  lethal: boolean
}

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** DOM heads-up display. Reads sim state; never writes to it. */
export class Hud {
  private root: HTMLElement
  private feed: FeedEntry[] = []
  private hitTimer = 0
  private hitHeadshot = false
  private localId = 0
  private bannerTimer = 0
  private bannerText = ''
  private abilityWeapon = ''
  private el: Record<string, HTMLElement> = {}

  constructor(root: HTMLElement) {
    this.root = root
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-block"><span class="label">SCORE</span><span id="hud-score">0</span><span class="dim" id="hud-limit">/ 25</span></div>
        <div class="hud-timer" id="hud-timer">8:00</div>
        <div class="hud-block"><span class="label">PLACE</span><span id="hud-place">1st</span></div>
      </div>
      <div class="crosshair" id="hud-crosshair"><i></i><i></i><i></i><i></i><b class="crosshair-dot"></b></div>
      <div class="scope" id="hud-scope"><div class="scope-reticle"></div></div>
      <div class="hitmarker" id="hud-hitmarker"></div>
      <div class="grapple-boost" id="hud-grapple">
        <div class="grapple-label"><span>GRAPPLE BOOST</span><span id="hud-grapple-time">5.0s</span></div>
        <div class="bar"><div class="fill grapple" id="hud-grapple-fill"></div></div>
      </div>
      <div class="hud-abilities" id="hud-abilities"></div>
      <div class="hud-bottom-left">
        <div class="health">
          <div class="health-num"><span id="hud-hp">100</span><i id="hud-hpmax">/ 100</i></div>
          <div class="bar"><div class="fill hp" id="hud-hpbar"></div></div>
        </div>
        <div class="style">
          <div class="bar slim"><div class="fill sp" id="hud-spbar"></div></div>
          <div class="style-label"><span id="hud-sp">0</span> SP <i id="hud-cdr">+0% CDR</i></div>
        </div>
      </div>
      <div class="hud-bottom-right">
        <div class="weapon-name" id="hud-weapon">—</div>
        <div class="ammo"><span id="hud-ammo">30</span><i id="hud-ammomax">/ 30</i></div>
        <div class="slotbar" id="hud-slots"></div>
      </div>
      <div class="killfeed" id="hud-feed"></div>
      <div class="banner" id="hud-banner"></div>
      <div class="vignette" id="hud-vignette"></div>
    `
    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[id^="hud-"]'))) {
      this.el[node.id] = node
    }
    this.el['hud-vignette'] = root.querySelector<HTMLElement>('.vignette')!
  }

  reset(localId = 0): void {
    this.localId = localId
    this.feed = []
    this.hitTimer = 0
    this.bannerTimer = 0
    this.abilityWeapon = ''
    this.el['hud-feed'].innerHTML = ''
    this.el['hud-abilities'].innerHTML = ''
    this.root.classList.remove('dead')
  }

  handleEvents(events: SimEvent[], world: World): void {
    for (const e of events) {
      if (e.type === 'kill') {
        const killer = world.players.find((p) => p.id === e.killerId)
        const victim = world.players.find((p) => p.id === e.victimId)
        const wname = e.weaponId ? weaponDef(e.weaponId).name : 'the void'
        const tag = e.lethal ? ' LETHAL' : e.headshot ? ' HS' : ''
        this.feed.push({
          text: `${killer?.name ?? '???'} → ${victim?.name ?? '???'} · ${wname}${tag}`,
          at: performance.now(),
          headshot: e.headshot,
          lethal: e.lethal,
        })
        if (this.feed.length > 6) this.feed.shift()
        this.renderFeed()
        if (e.killerId === this.localId) this.showBanner(e.lethal ? 'LETHAL' : e.headshot ? 'HEADSHOT' : 'ELIMINATED', 0.9)
      } else if (e.type === 'hit' && e.playerId === this.localId) {
        this.hitTimer = 0.14
        this.hitHeadshot = e.headshot
      } else if (e.type === 'damage' && e.playerId === this.localId) {
        this.bumpVignette()
      } else if (e.type === 'exposed' && e.playerId === this.localId) {
        this.showBanner('EXPOSED', 1.2)
      } else if (e.type === 'ability' && e.playerId === this.localId) {
        this.showBanner(e.name.toUpperCase(), 0.8)
      } else if (e.type === 'orb' && e.playerId === this.localId) {
        this.showBanner(`+${Math.round(e.amount)} HP`, 0.5)
      }
    }
  }

  private renderFeed(): void {
    let html = ''
    for (let i = this.feed.length - 1; i >= 0; i--) {
      const f = this.feed[i]
      const cls = f.lethal ? 'lethal' : f.headshot ? 'hs' : ''
      html += `<div class="feed-item ${cls}">${f.text}</div>`
    }
    this.el['hud-feed'].innerHTML = html
  }

  private bumpVignette(): void {
    const v = this.el['hud-vignette']
    v.classList.remove('flash')
    void v.offsetWidth
    v.classList.add('flash')
  }

  private showBanner(text: string, seconds: number): void {
    this.bannerText = text
    this.bannerTimer = seconds
    this.el['hud-banner'].textContent = text
    this.el['hud-banner'].classList.add('show')
  }

  update(world: World, dt: number): void {
    const local = world.players.find((p) => p.id === this.localId)
    if (!local) return
    const set = (id: string, text: string) => {
      const node = this.el[id]
      if (node && node.textContent !== text) node.textContent = text
    }

    set('hud-score', String(local.score))
    set('hud-limit', `/ ${world.match.scoreLimit}`)
    set('hud-timer', fmtTime(world.match.timeLimit - (world.time - world.match.startedAt)))
    const ranked = [...world.players].sort((a, b) => b.score - a.score)
    const place = ranked.findIndex((p) => p.id === local.id) + 1
    set('hud-place', `${place}${place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'}`)

    set('hud-hp', String(Math.ceil(Math.max(0, local.health))))
    set('hud-hpmax', `/ ${Math.round(local.stats.maxHealth)}`)
    this.el['hud-hpbar'].style.width = `${Math.max(0, Math.min(100, (local.health / local.stats.maxHealth) * 100))}%`
    this.el['hud-hpbar'].classList.toggle('low', local.health / local.stats.maxHealth < 0.3)
    const grappleFuel = Math.max(0, Math.min(5, local.grappleBoostFuel))
    const grappleActive = local.grapples.some((hook) => hook.active)
    this.el['hud-grapple'].classList.toggle('show', grappleActive || grappleFuel < 5)
    this.el['hud-grapple-fill'].style.width = `${(grappleFuel / 5) * 100}%`
    set('hud-grapple-time', `${grappleFuel.toFixed(1)}s`)
    this.root.classList.toggle('grapple-boosting', local.grappleBoosting)

    set('hud-sp', String(Math.floor(local.sp)))
    this.el['hud-spbar'].style.width = `${local.sp}%`
    set('hud-cdr', `+${Math.round(passiveCdr(local) * 100)}% CDR`)

    this.root.classList.toggle('dead', !local.alive)

    const weaponId = local.loadout.slots[local.slot]
    const def = weaponId ? weaponDef(weaponId) : null
    const rt = weaponId ? local.weapons[weaponId] : null
    set('hud-weapon', def ? def.name : '—')
    const maxAmmo = def?.fire.magazine ?? 0
    if (maxAmmo === 0) {
      set('hud-ammo', '∞')
      set('hud-ammomax', '')
    } else {
      set('hud-ammo', rt?.reloading ? '…' : String(rt?.ammo ?? 0))
      set('hud-ammomax', `/ ${maxAmmo}`)
    }

    // Dynamic crosshair: opens up and blooms as movement degrades accuracy.
    const crosshair = this.el['hud-crosshair']
    const moveSpeed = Math.hypot(local.vel.x, local.vel.z)
    const baseGap = def ? Math.min(9, def.fire.spread * 900) : 3
    let gap = baseGap
    if (local.aiming) {
      gap *= 0.4
    } else {
      gap += Math.min(13, moveSpeed * 1.15)
      if (!local.onGround) gap += 5
      if (local.sliding) gap += 2
    }
    crosshair.style.setProperty('--gap', `${Math.max(1, Math.min(16, gap)).toFixed(1)}px`)
    crosshair.classList.toggle('bloom', !local.aiming && (moveSpeed > 3.5 || !local.onGround))
    this.root.classList.toggle('scoped', !!local.aiming && def?.type === 'sniper')

    // Slot bar.
    const slots = this.el['hud-slots']
    const signature = local.loadout.slots.join(',') + '|' + local.slot
    if (slots.dataset.sig !== signature) {
      slots.dataset.sig = signature
      slots.innerHTML = local.loadout.slots
        .map((id, i) => {
          const label = id ? weaponDef(id).type.slice(0, 2).toUpperCase() : '··'
          return `<div class="slot ${id ? 'filled' : ''} ${i === local.slot ? 'active' : ''}"><span>${i + 1}</span>${label}</div>`
        })
        .join('')
    }

    // Ability tiles.
    if (weaponId && weaponId !== this.abilityWeapon) {
      this.abilityWeapon = weaponId
      this.el['hud-abilities'].innerHTML = `
        <div class="ability" id="hud-f">
          <div class="ability-key">F</div>
          <div class="ability-body"><div class="ability-name"></div><div class="ability-meta"></div></div>
          <div class="ability-cd" id="hud-f-cd"></div>
        </div>
        <div class="ability op" id="hud-t">
          <div class="ability-key">T</div>
          <div class="ability-body"><div class="ability-name"></div><div class="ability-meta"></div></div>
          <div class="ability-cd" id="hud-t-cd"></div>
          <div class="ability-charge"></div>
        </div>`
      if (def) {
        const fTile = this.el['hud-abilities'].querySelector('#hud-f')!
        const tTile = this.el['hud-abilities'].querySelector('#hud-t')!
        fTile.querySelector('.ability-name')!.textContent = def.f.name
        tTile.querySelector('.ability-name')!.textContent = def.t.name
        fTile.querySelector('.ability-meta')!.textContent = `${def.f.tags.join(' · ')}${def.f.lethal ? ' · LETHAL' : ''}`
        tTile.querySelector('.ability-meta')!.textContent = `${def.t.tags.join(' · ')}${
          def.t.lethal ? ` · LETHAL [${CONDITION_LABEL[def.t.lethal]}]` : ''
        }`
        tTile.classList.toggle('is-lethal', !!def.t.lethal)
      }
    }

    if (weaponId) {
      const f = abilityStatus(world, local, 'F')
      const t = abilityStatus(world, local, 'T')
      const fTile = this.el['hud-abilities'].querySelector<HTMLElement>('#hud-f')
      const tTile = this.el['hud-abilities'].querySelector<HTMLElement>('#hud-t')
      if (fTile && f) {
        fTile.classList.toggle('ready', f.ready)
        fTile.querySelector('#hud-f-cd')!.textContent = f.ready ? '' : f.cooldownRemaining.toFixed(1)
      }
      if (tTile && t) {
        tTile.classList.toggle('ready', t.ready)
        const pct = t.chargeNeeded > 0 ? Math.min(100, (t.charge / t.chargeNeeded) * 100) : 0
        const cdNode = tTile.querySelector<HTMLElement>('#hud-t-cd')
        if (cdNode) cdNode.textContent = t.ready ? '' : Math.max(0, t.cooldownRemaining).toFixed(0)
        const bar = tTile.querySelector<HTMLElement>('.ability-charge')
        if (bar) {
          bar.style.width = `${pct}%`
          bar.classList.toggle('show', !t.ready && pct > 0)
        }
      }
    }

    // Hitmarker + banner timers.
    this.hitTimer = Math.max(0, this.hitTimer - dt)
    const marker = this.el['hud-hitmarker']
    marker.classList.toggle('show', this.hitTimer > 0)
    marker.classList.toggle('headshot', this.hitHeadshot)

    this.bannerTimer = Math.max(0, this.bannerTimer - dt)
    this.el['hud-banner'].classList.toggle('show', this.bannerTimer > 0)

    const exposed = world.time < local.exposedUntil
    this.root.classList.toggle('exposed', exposed)
    const lethalActive = local.effects.some((e) => !!e.lethal)
    this.root.classList.toggle('lethal-window', lethalActive)
    void this.bannerText
  }
}
