import { MAPS } from '../data/maps'
import { UPGRADES, MAX_POINTS, canSpend, pointsSpent, refundPoint, spendPoint } from '../data/upgrades'
import type { UpgradeKey } from '../data/types'
import { WEAPONS, weapon as weaponDef } from '../data/weapons'
import { WEAPON_TYPES, WEAPON_TYPE_LABEL, CONDITION_LABEL } from '../data/types'
import { deriveStats, emptyLoadout } from '../sim/player'
import type { Loadout } from '../sim/types'
import type { BotDifficulty } from '../sim/bots'
import type { UpgradeSpend } from '../data/upgrades'
import type { World } from '../sim/types'
import { leaderboard } from '../sim/match'

export interface MenuSettings {
  mapId: string
  botCount: number
  difficulty: BotDifficulty
  mode: 'ffa' | 'training'
  loadout: Loadout
  upgrades: UpgradeSpend
}

const SETTINGS_STORAGE_KEY = 'surge.menu.settings.v1'

function cloneSettings(settings: MenuSettings): MenuSettings {
  return {
    ...settings,
    loadout: { slots: [...settings.loadout.slots] },
    upgrades: { ...settings.upgrades },
  }
}

export function parseSavedSettings(raw: string | null, defaults: MenuSettings): MenuSettings {
  const fallback = () => cloneSettings(defaults)
  if (!raw) return fallback()

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    console.warn('Ignoring invalid saved SURGE settings.', error)
    return fallback()
  }
  if (!value || typeof value !== 'object') return fallback()

  const saved = value as { version?: unknown; settings?: unknown }
  if (saved.version !== 1 || !saved.settings || typeof saved.settings !== 'object') return fallback()
  const settings = saved.settings as Record<string, unknown>

  const result = fallback()
  if (typeof settings.mapId === 'string' && MAPS.some((map) => map.id === settings.mapId)) {
    result.mapId = settings.mapId
  }
  if (Number.isInteger(settings.botCount) && Number(settings.botCount) >= 1 && Number(settings.botCount) <= 11) {
    result.botCount = Number(settings.botCount)
  }
  if (settings.difficulty === 'easy' || settings.difficulty === 'normal' || settings.difficulty === 'hard' || settings.difficulty === 'elite') {
    result.difficulty = settings.difficulty
  }
  if (settings.mode === 'ffa' || settings.mode === 'training') result.mode = settings.mode

  const slots = (settings.loadout as { slots?: unknown } | null)?.slots
  if (Array.isArray(slots) && slots.length === result.loadout.slots.length) {
    const seen = new Set<string>()
    result.loadout.slots = slots.map((id) => {
      if (id === null) return null
      if (typeof id !== 'string' || !WEAPONS.some((weapon) => weapon.id === id) || seen.has(id)) return null
      seen.add(id)
      return id
    })
  }

  const upgrades = settings.upgrades
  if (upgrades && typeof upgrades === 'object') {
    const candidate = upgrades as Record<string, unknown>
    const valid = UPGRADES.every(
      (upgrade) => Number.isInteger(candidate[upgrade.key]) && Number(candidate[upgrade.key]) >= 0 && Number(candidate[upgrade.key]) <= 2,
    )
    const total = UPGRADES.reduce((sum, upgrade) => sum + Number(candidate[upgrade.key]), 0)
    if (valid && total <= MAX_POINTS) {
      for (const upgrade of UPGRADES) result.upgrades[upgrade.key] = Number(candidate[upgrade.key])
    }
  }

  return result
}

type Screen = 'none' | 'main' | 'pause' | 'results'

export class Menu {
  private root: HTMLElement
  settings: MenuSettings
  onStart: ((s: MenuSettings) => void) | null = null
  onResume: (() => void) | null = null
  onQuit: (() => void) | null = null
  private screen: Screen = 'none'
  private pickerSlot = -1

  constructor(root: HTMLElement) {
    this.root = root
    this.settings = {
      mapId: MAPS[0].id,
      botCount: 7,
      difficulty: 'normal',
      mode: 'ffa',
      loadout: { slots: ['reaper', 'breacher', 'gilded', 'ghostline', null, null, null] },
      upgrades: { vitality: 2, agility: 2, dexterity: 0, focus: 1, grapple: 0, might: 0 },
    }
    try {
      this.settings = parseSavedSettings(localStorage.getItem(SETTINGS_STORAGE_KEY), this.settings)
    } catch (error) {
      console.warn('Unable to load saved SURGE settings.', error)
    }
  }

  private persistSettings(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, settings: this.settings }))
    } catch (error) {
      console.warn('Unable to save SURGE settings.', error)
    }
  }

  get active(): boolean {
    return this.screen !== 'none'
  }

  hide(): void {
    this.screen = 'none'
    this.pickerSlot = -1
    this.root.innerHTML = ''
    this.root.classList.remove('open')
  }

  showMain(): void {
    this.screen = 'main'
    this.render()
  }

  showPause(): void {
    this.screen = 'pause'
    this.render()
  }

  showResults(world: World): void {
    this.screen = 'results'
    const rows = leaderboard(world)
      .map(
        (p, i) => `
        <tr class="${p.id === 0 ? 'you' : ''}">
          <td>${i + 1}</td>
          <td>${p.name}${p.isBot ? ' <span class="dim">bot</span>' : ''}</td>
          <td>${p.kills}</td>
          <td>${p.deaths}</td>
          <td>${Math.round((p.kills / Math.max(1, p.deaths)) * 100) / 100}</td>
        </tr>`,
      )
      .join('')
    this.root.innerHTML = `
      <div class="panel wide">
        <h1 class="results-title">${world.players[0].id === world.match.winnerId ? 'VICTORY' : 'MATCH OVER'}</h1>
        <div class="dim center">${world.map.name}</div>
        <table class="scoreboard">
          <thead><tr><th>#</th><th>PLAYER</th><th>K</th><th>D</th><th>K/D</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="row gap">
          <button class="btn primary" data-action="again">PLAY AGAIN</button>
          <button class="btn" data-action="quit">MAIN MENU</button>
        </div>
      </div>`
    this.root.classList.add('open')
    this.bindResults()
  }

  private bindResults(): void {
    this.root.querySelectorAll<HTMLElement>('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action
        if (action === 'again') this.onStart?.(this.settings)
        if (action === 'quit') {
          this.hide()
          this.showMain()
          this.onQuit?.()
        }
      })
    })
  }

  private render(): void {
    this.root.classList.add('open')
    if (this.screen === 'pause') this.renderPause()
    else this.renderMain()
  }

  private renderPause(): void {
    this.root.innerHTML = `
      <div class="panel">
        <h2>PAUSED</h2>
        <div class="controls">
          <div><b>WASD</b> move</div><div><b>Shift</b> sprint</div><div><b>C</b> crouch</div>
          <div><b>Shift+C</b> slide</div><div><b>Space ×2</b> double jump</div><div><b>Q / E</b> grapples</div>
          <div><b>LMB</b> fire</div><div><b>F / T</b> abilities</div><div><b>Z+F / Z+T</b> style spends</div>
          <div><b>G</b> explosive</div><div><b>V</b> blade</div><div><b>R</b> reload</div>
          <div><b>1-7 / wheel</b> slots</div><div><b>Esc</b> pause</div><div></div>
        </div>
        <div class="row gap">
          <button class="btn primary" data-action="resume">RESUME</button>
          <button class="btn" data-action="quit">QUIT TO MENU</button>
        </div>
      </div>`
    this.root.querySelector('[data-action="resume"]')?.addEventListener('click', () => this.onResume?.())
    this.root.querySelector('[data-action="quit"]')?.addEventListener('click', () => {
      this.hide()
      this.showMain()
      this.onQuit?.()
    })
  }

  private renderMain(): void {
    const s = this.settings
    const stats = deriveStats(s.loadout, s.upgrades)
    const equipped = s.loadout.slots.filter((x): x is string => !!x)
    const spent = pointsSpent(s.upgrades)

    const slotHtml = s.loadout.slots
      .map((id, i) => {
        const def = id ? weaponDef(id) : null
        return `
        <button class="slot-card ${def ? 'filled' : ''}" data-slot="${i}">
          <span class="slot-index">${i + 1}</span>
          ${
            def
              ? `<span class="slot-name">${def.name}</span>
                 <span class="slot-type">${def.type.toUpperCase()}</span>
                 <span class="slot-ability">F ${def.f.name}</span>
                 <span class="slot-ability op">T ${def.t.name}${def.t.lethal ? ' · LETHAL' : ''}</span>`
              : `<span class="slot-empty">EMPTY</span><span class="slot-type dim">buff slot</span>`
          }
        </button>`
      })
      .join('')

    const upgradeHtml = UPGRADES.map((u) => {
      const value = s.upgrades[u.key]
      return `
        <div class="upgrade-row">
          <div class="upgrade-info"><b>${u.name}</b><span class="dim">${u.perPoint}</span></div>
          <div class="pips">${[0, 1, 2]
            .map((i) => `<i class="${i < value ? 'on' : ''}"></i>`)
            .join('')}</div>
          <div class="row">
            <button class="mini" data-up="${u.key}" ${canSpend(s.upgrades, u.key) ? '' : 'disabled'}>+</button>
            <button class="mini" data-down="${u.key}" ${value > 0 ? '' : 'disabled'}>−</button>
          </div>
        </div>`
    }).join('')

    const packageText = stats.specialist
      ? 'SPECIALIST — full package active'
      : stats.duelist
        ? 'DUELIST — half package active'
        : stats.emptySlots > 0
          ? `${stats.emptySlots} empty slot buffs: ${stats.buffs.join(', ') || '—'}`
          : 'No loadout bonuses'

    this.root.innerHTML = `
      <div class="menu-shell">
        <header class="menu-header">
          <div class="logo">SURGE<span class="logo-tag">MOVEMENT IS A WEAPON</span></div>
          <div class="menu-sub">Loadout is identity · ${equipped.length}/7 equipped · ${stats.maxHealth} HP · ${stats.specialist ? 'specialist' : stats.duelist ? 'duelist' : 'balanced'}</div>
        </header>
        <div class="menu-columns">
          <section class="panel grow">
            <h3>LOADOUT <span class="dim">click a slot to change it</span></h3>
            <div class="slots">${slotHtml}</div>
            <div class="loadout-footer">
              <span class="dim">${packageText}</span>
              <div class="row gap">
                <button class="btn ghost" data-action="randomize">RANDOM</button>
                <button class="btn ghost" data-action="clear">CLEAR</button>
              </div>
            </div>
          </section>
          <section class="panel side">
            <h3>UPGRADES <span class="dim">${spent}/${MAX_POINTS} points</span></h3>
            <div class="upgrades">${upgradeHtml}</div>
          </section>
        </div>
        <section class="panel match">
          <h3>MATCH</h3>
          <div class="match-row">
            <label>MAP
              <select id="map-select">
                ${MAPS.map((m) => `<option value="${m.id}" ${m.id === s.mapId ? 'selected' : ''}>${m.name}</option>`).join('')}
              </select>
            </label>
            <label>BOTS
              <input id="bot-count" type="range" min="1" max="11" value="${s.botCount}" />
              <span id="bot-count-label">${s.botCount}</span>
            </label>
            <label>DIFFICULTY
              <select id="difficulty">
                ${(['easy', 'normal', 'hard', 'elite'] as BotDifficulty[])
                  .map((d) => `<option value="${d}" ${d === s.difficulty ? 'selected' : ''}>${d.toUpperCase()}</option>`)
                  .join('')}
              </select>
            </label>
            <label>MODE
              <select id="mode-select">
                <option value="ffa" ${s.mode === 'ffa' ? 'selected' : ''}>FREE FOR ALL</option>
                <option value="training" ${s.mode === 'training' ? 'selected' : ''}>TRAINING GROUND</option>
              </select>
            </label>
          </div>
          <div class="map-info">
            <b>${MAPS.find((m) => m.id === s.mapId)?.name}</b>
            <span>${MAPS.find((m) => m.id === s.mapId)?.blurb}</span>
            <span class="dim">${MAPS.find((m) => m.id === s.mapId)?.bestLoadouts}</span>
          </div>
          <button class="btn primary big" data-action="start" ${equipped.length === 0 ? 'disabled' : ''}>DROP IN</button>
        </section>
      </div>
      ${
        this.pickerSlot >= 0
          ? `<div class="picker-backdrop">
              <div class="picker">
                <h3>SLOT ${this.pickerSlot + 1}</h3>
                ${WEAPON_TYPES.map((type) => {
                  const list = WEAPONS.filter((w) => w.type === type)
                  if (!list.length) return ''
                  return `<div class="picker-group"><h4>${WEAPON_TYPE_LABEL[type]}</h4>
                    ${list
                      .map((w) => {
                        const used = s.loadout.slots.includes(w.id) && s.loadout.slots[this.pickerSlot] !== w.id
                        return `<button class="picker-item" data-weapon="${w.id}" ${used ? 'disabled' : ''}>
                          <span class="pi-name">${w.name}</span>
                          <span class="pi-ability">F ${w.f.name} · T ${w.t.name}${w.t.lethal ? ` [${CONDITION_LABEL[w.t.lethal]}]` : ''}</span>
                          <span class="pi-blurb dim">${w.blurb}</span>
                        </button>`
                      })
                      .join('')}
                  </div>`
                }).join('')}
                <div class="row gap">
                  <button class="btn ghost" data-action="empty-slot">EMPTY SLOT</button>
                  <button class="btn" data-action="close-picker">CANCEL</button>
                </div>
              </div>
            </div>`
          : ''
      }
    `
    this.bindMain()
  }

  private bindMain(): void {
    const root = this.root
    root.querySelectorAll<HTMLElement>('[data-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.pickerSlot = Number(btn.dataset.slot)
        this.renderMain()
      })
    })
    root.querySelectorAll<HTMLElement>('[data-up]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settings.upgrades = spendPoint(this.settings.upgrades, btn.dataset.up as UpgradeKey)
        this.persistSettings()
        this.renderMain()
      })
    })
    root.querySelectorAll<HTMLElement>('[data-down]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settings.upgrades = refundPoint(this.settings.upgrades, btn.dataset.down as UpgradeKey)
        this.persistSettings()
        this.renderMain()
      })
    })
    root.querySelectorAll<HTMLElement>('[data-weapon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.weapon!
        const slots = [...this.settings.loadout.slots]
        const existing = slots.indexOf(id)
        if (existing >= 0) slots[existing] = null
        slots[this.pickerSlot] = id
        this.settings.loadout = { slots }
        this.pickerSlot = -1
        this.persistSettings()
        this.renderMain()
      })
    })
    root.querySelector('[data-action="close-picker"]')?.addEventListener('click', () => {
      this.pickerSlot = -1
      this.renderMain()
    })
    root.querySelector('[data-action="empty-slot"]')?.addEventListener('click', () => {
      const slots = [...this.settings.loadout.slots]
      slots[this.pickerSlot] = null
      this.settings.loadout = { slots }
      this.pickerSlot = -1
      this.persistSettings()
      this.renderMain()
    })
    root.querySelector('[data-action="randomize"]')?.addEventListener('click', () => {
      const pool = [...WEAPONS].sort(() => Math.random() - 0.5)
      const count = 2 + Math.floor(Math.random() * 3)
      const slots: (string | null)[] = new Array(7).fill(null)
      const indices = [0, 1, 3, 5, 6].sort(() => Math.random() - 0.5).slice(0, count)
      indices.forEach((idx, i) => (slots[idx] = pool[i].id))
      this.settings.loadout = { slots }
      this.persistSettings()
      this.renderMain()
    })
    root.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
      this.settings.loadout = emptyLoadout()
      this.persistSettings()
      this.renderMain()
    })
    root.querySelector<HTMLSelectElement>('#map-select')?.addEventListener('change', (e) => {
      this.settings.mapId = (e.target as HTMLSelectElement).value
      this.persistSettings()
      this.renderMain()
    })
    root.querySelector<HTMLSelectElement>('#difficulty')?.addEventListener('change', (e) => {
      this.settings.difficulty = (e.target as HTMLSelectElement).value as BotDifficulty
      this.persistSettings()
      this.renderMain()
    })
    root.querySelector<HTMLSelectElement>('#mode-select')?.addEventListener('change', (e) => {
      this.settings.mode = (e.target as HTMLSelectElement).value as MenuSettings['mode']
      this.persistSettings()
      this.renderMain()
    })
    const range = root.querySelector<HTMLInputElement>('#bot-count')
    range?.addEventListener('input', () => {
      this.settings.botCount = Number(range.value)
      this.persistSettings()
      const label = root.querySelector('#bot-count-label')
      if (label) label.textContent = range.value
    })
    root.querySelector('[data-action="start"]')?.addEventListener('click', () => {
      this.persistSettings()
      this.onStart?.(this.settings)
    })
  }
}
