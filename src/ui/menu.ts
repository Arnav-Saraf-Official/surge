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
  allyBots: number
  enemyBots: number
  difficulty: BotDifficulty
  mode: 'ffa' | 'training' | 'tdm'
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
  for (const key of ['allyBots', 'enemyBots'] as const) {
    const value = settings[key]
    if (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 8) {
      result[key] = Number(value)
    }
  }
  if (settings.difficulty === 'easy' || settings.difficulty === 'normal' || settings.difficulty === 'hard' || settings.difficulty === 'elite') {
    result.difficulty = settings.difficulty
  }
  if (settings.mode === 'ffa' || settings.mode === 'training' || settings.mode === 'tdm') result.mode = settings.mode

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
      allyBots: 3,
      enemyBots: 4,
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
    const table = leaderboard(world)
    const me = table.find((p) => p.id === 0)
    const tdm = world.match.mode === 'tdm'
    const victory = tdm
      ? world.match.winnerTeam === me?.team
      : world.players[0].id === world.match.winnerId
    const scoreLine = tdm
      ? `ALPHA ${world.match.teamScores[0]} — ${world.match.teamScores[1]} BRAVO · `
      : ''
    const kd = Math.round(((me?.kills ?? 0) / Math.max(1, me?.deaths ?? 0)) * 100) / 100
    const rows = table
      .map(
        (p, i) => `
        <tr class="${p.id === 0 ? 'you' : ''}">
          <td>${String(i + 1).padStart(2, '0')}</td>
          <td>${p.name}${p.isBot ? ' <span class="dim">bot</span>' : ''}</td>
          <td>${p.kills}</td>
          <td>${p.deaths}</td>
          <td>${Math.round((p.kills / Math.max(1, p.deaths)) * 100) / 100}</td>
        </tr>`,
      )
      .join('')
    this.root.innerHTML = `
      <div class="menu overlay-shell">
        <div class="dialog wide" role="dialog" aria-modal="true" aria-labelledby="results-title">
          <span class="dialog-eyebrow">Match report · ${world.map.name}</span>
          <h1 class="dialog-title" id="results-title">${victory ? 'Victory' : 'Match over'}</h1>
          <p class="dialog-sub">${scoreLine}${me?.kills ?? 0} eliminations · ${me?.deaths ?? 0} deaths · ${kd} K/D</p>
          <table class="scoreboard">
            <thead><tr><th>#</th><th>Operative</th><th>K</th><th>D</th><th>K/D</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="row gap">
            <button class="btn primary" data-action="again">Play again</button>
            <button class="btn ghost" data-action="quit">Main menu</button>
          </div>
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
      <div class="menu overlay-shell">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <span class="dialog-eyebrow">Field link held</span>
          <h2 class="dialog-title" id="pause-title">Paused</h2>
          <p class="dialog-sub">Take a breath. The match clock is stopped.</p>
          <div class="controls">
            <div><b>WASD</b> move</div><div><b>Shift</b> sprint</div><div><b>C</b> crouch</div>
            <div><b>Shift+C</b> slide</div><div><b>Space ×2</b> double jump</div><div><b>Q / E</b> grapples</div>
            <div><b>LMB</b> fire</div><div><b>RMB</b> aim / blade technique</div><div><b>F / T</b> abilities</div>
            <div><b>Hold Z</b> hide in cover</div><div><b>X</b> camera view</div><div><b>Z+F / Z+T</b> style spends</div><div><b>G</b> explosive</div><div><b>V</b> blade</div>
            <div><b>R</b> reload</div><div><b>1-7 / wheel</b> slots</div><div><b>Esc</b> resume</div>
          </div>
          <div class="row gap">
            <button class="btn primary" data-action="resume">Resume</button>
            <button class="btn ghost" data-action="quit">Quit to menu</button>
          </div>
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
    const phantomSightAvailable =
      s.loadout.slots.includes('ghostline') && s.loadout.slots.includes('katana')
    const spent = pointsSpent(s.upgrades)
    const map = MAPS.find((m) => m.id === s.mapId) ?? MAPS[0]
    const packageLabel = stats.specialist ? 'SPECIALIST' : stats.duelist ? 'DUELIST' : 'BALANCED'
    const statusLine = `${
      s.mode === 'training' ? 'Training ground' : s.mode === 'tdm' ? 'Team deathmatch' : 'Free for all'
    } · ${
      s.mode === 'tdm' ? `Alpha ${s.allyBots + 1} vs Bravo ${s.enemyBots}` : `${s.botCount} bots`
    } · ${s.difficulty}`

    const slotHtml = s.loadout.slots
      .map((id, i) => {
        const def = id ? weaponDef(id) : null
        const phantomSight = id === 'ghostline' && phantomSightAvailable
        return `
        <button class="slot-card ${def ? 'filled' : ''}" data-slot="${i}" aria-label="Slot ${i + 1}: ${def ? def.name : 'empty'}">
          <span class="slot-index">${String(i + 1).padStart(2, '0')}</span>
          <span class="slot-body">
            ${
              def
                ? `<span class="slot-top"><span class="slot-name">${def.name}</span><span class="slot-type">${def.type.toUpperCase()}</span></span>
                   <span class="slot-abilities"><span>F · ${def.f.name}</span><span class="${def.t.lethal || phantomSight ? 'lethal' : ''}">T · ${phantomSight ? 'Phantom Sight' : def.t.name}${def.t.lethal || phantomSight ? ' · LETHAL' : ''}</span></span>`
                : `<span class="slot-empty">Empty slot</span><span class="slot-type dim">free buff</span>`
            }
          </span>
          <span class="slot-add" aria-hidden="true">+</span>
        </button>`
      })
      .join('')

    const upgradeHtml = UPGRADES.map((u) => {
      const value = s.upgrades[u.key]
      return `
        <div class="upgrade-row">
          <div class="upgrade-info"><b>${u.name}</b><span>${u.perPoint}</span></div>
          <div class="pips" aria-label="${u.name}: ${value} of 3 points">${[0, 1, 2]
            .map((i) => `<i class="${i < value ? 'on' : ''}"></i>`)
            .join('')}</div>
          <div class="upgrade-controls">
            <button class="mini" data-down="${u.key}" aria-label="Refund ${u.name}" ${value > 0 ? '' : 'disabled'}>−</button>
            <span class="upgrade-value">${value}</span>
            <button class="mini" data-up="${u.key}" aria-label="Add ${u.name}" ${canSpend(s.upgrades, u.key) ? '' : 'disabled'}>+</button>
          </div>
        </div>`
    }).join('')

    const packageText = phantomSightAvailable
      ? 'Phantom Sight unlocked — use T while holding Ghostline.'
      : stats.specialist
      ? 'Specialist package online — every F and T bonus is active.'
      : stats.duelist
        ? 'Duelist package online — the two-weapon synergy is active.'
        : stats.emptySlots > 0
          ? `${stats.emptySlots} empty ${stats.emptySlots === 1 ? 'slot' : 'slots'} granting: ${stats.buffs.join(', ') || '—'}.`
          : 'No loadout bonuses active.'

    const mapHtml = MAPS.map(
      (m, i) => `
        <button class="map-card" data-map="${m.id}" aria-pressed="${m.id === s.mapId}">
          <span class="map-index">${String(i + 1).padStart(2, '0')}</span>
          <span class="map-name">${m.name}</span>
          <span class="map-setting">${m.setting}</span>
        </button>`,
    ).join('')

    const difficultyHtml = (['easy', 'normal', 'hard', 'elite'] as BotDifficulty[])
      .map((d) => `<button class="seg-btn" data-difficulty="${d}" aria-pressed="${s.difficulty === d}">${d}</button>`)
      .join('')
    const modeHtml = (['ffa', 'tdm', 'training'] as const)
      .map(
        (m) =>
          `<button class="seg-btn" data-mode="${m}" aria-pressed="${s.mode === m}">${
            m === 'ffa' ? 'Free for all' : m === 'tdm' ? 'Team deathmatch' : 'Training'
          }</button>`,
      )
      .join('')

    this.root.innerHTML = `
      <div class="menu">
        <header class="menu-top">
          <div class="brand">
            <svg class="brand-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 22 21H2Z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 8 17.2 18H6.8Z" fill="currentColor"/></svg>
            SURGE
            <span class="brand-sub">Movement is a weapon</span>
          </div>
          <div class="menu-meta"><span class="dot" aria-hidden="true"></span>Frontier ops / 07<span class="sep" aria-hidden="true"></span>Build 0.1</div>
        </header>
        <div class="menu-grid">
          <aside class="menu-hero">
            <p class="eyebrow">Tactical movement shooter</p>
            <h1 class="menu-title">SURGE<span class="title-dot">.</span></h1>
            <p class="menu-tag">The floor is a suggestion.</p>
            <p class="menu-copy">Build a loadout, pick your ground, then outmanoeuvre everyone on it. ${equipped.length} of 7 slots armed.</p>
            <div class="hero-stats">
              <div class="hero-stat"><span>Health</span><b>${stats.maxHealth}</b></div>
              <div class="hero-stat"><span>Armed</span><b>${equipped.length}<i>/7</i></b></div>
              <div class="hero-stat"><span>Build</span><b class="hero-build">${packageLabel}</b></div>
            </div>
            <div class="hero-deploy">
              <button class="deploy" data-action="start" ${equipped.length === 0 ? 'disabled' : ''}>
                <span class="deploy-label">Deploy</span>
                <span class="deploy-map">${map.name}</span>
              </button>
              <span class="deploy-hint">${statusLine}</span>
            </div>
            <div class="hero-note"><span>Loadout saved locally</span><span>${spent}/${MAX_POINTS} pts</span></div>
          </aside>
          <div class="menu-content">
            <section class="panel">
              <div class="panel-head"><h2><span class="ph-index">01</span>Loadout</h2><span class="ph-meta">${equipped.length} of 7 armed</span></div>
              <div class="slots">${slotHtml}</div>
              <div class="loadout-footer">
                <span class="build-note">${packageText}</span>
                <div class="row gap">
                  <button class="btn ghost" data-action="randomize">Randomize</button>
                  <button class="btn ghost" data-action="clear">Clear all</button>
                </div>
              </div>
            </section>
            <section class="panel">
              <div class="panel-head"><h2><span class="ph-index">02</span>Operative</h2><span class="ph-meta">${spent} / ${MAX_POINTS} points</span></div>
              <div class="upgrades">${upgradeHtml}</div>
            </section>
            <section class="panel">
              <div class="panel-head"><h2><span class="ph-index">03</span>Deployment</h2><span class="ph-meta">${MAPS.length} battlegrounds</span></div>
              <div class="map-grid" role="group" aria-label="Battleground">${mapHtml}</div>
              <div class="brief">
                <b>${map.name}</b>
                <span>${map.blurb}</span>
                <span class="brief-tip">${map.bestLoadouts}</span>
              </div>
              <div class="match-options">
                <div class="field">
                  <span class="field-label" id="difficulty-label">Difficulty</span>
                  <div class="seg" role="group" aria-labelledby="difficulty-label">${difficultyHtml}</div>
                </div>
                <div class="field">
                  <span class="field-label" id="mode-label">Mode</span>
                  <div class="seg" role="group" aria-labelledby="mode-label">${modeHtml}</div>
                </div>
                ${
                  s.mode === 'tdm'
                    ? `
                <div class="field range-field">
                  <label class="field-label" for="ally-count">Allies · ${s.allyBots}</label>
                  <div class="range-row">
                    <input id="ally-count" type="range" min="0" max="8" value="${s.allyBots}" style="--fill:${(s.allyBots / 8) * 100}%" />
                    <output id="ally-count-label" for="ally-count">${s.allyBots}</output>
                  </div>
                </div>
                <div class="field range-field">
                  <label class="field-label" for="enemy-count">Enemies · ${s.enemyBots}</label>
                  <div class="range-row">
                    <input id="enemy-count" type="range" min="0" max="8" value="${s.enemyBots}" style="--fill:${(s.enemyBots / 8) * 100}%" />
                    <output id="enemy-count-label" for="enemy-count">${s.enemyBots}</output>
                  </div>
                  <span class="field-hint">You + ${s.allyBots} allies vs ${s.enemyBots} enemies · first to 40</span>
                </div>`
                    : `
                <div class="field range-field">
                  <label class="field-label" for="bot-count">Hostiles · ${s.botCount}</label>
                  <div class="range-row">
                    <input id="bot-count" type="range" min="1" max="11" value="${s.botCount}" style="--fill:${((s.botCount - 1) / 10) * 100}%" />
                    <output id="bot-count-label" for="bot-count">${s.botCount}</output>
                  </div>
                  <span class="field-hint">${
                    s.mode === 'training'
                      ? 'Passive targets for movement practice'
                      : 'Everyone for themselves · first to 25'
                  }</span>
                </div>`
                }
              </div>
            </section>
          </div>
        </div>
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
                          <span class="pi-ability">F ${w.f.name} · T ${w.t.name}${w.t.lethal ? ` [${CONDITION_LABEL[w.t.lethal]}]` : ''}${w.alt ? ` · RMB ${w.alt.name}` : ''}</span>
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
    root.querySelector<HTMLElement>('.picker-backdrop')?.addEventListener('click', (e) => {
      if (e.target !== e.currentTarget) return
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
    root.querySelectorAll<HTMLElement>('[data-map]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settings.mapId = btn.dataset.map!
        this.persistSettings()
        this.renderMain()
      })
    })
    root.querySelectorAll<HTMLElement>('[data-difficulty]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settings.difficulty = btn.dataset.difficulty as BotDifficulty
        this.persistSettings()
        this.renderMain()
      })
    })
    root.querySelectorAll<HTMLElement>('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settings.mode = btn.dataset.mode as MenuSettings['mode']
        this.persistSettings()
        this.renderMain()
      })
    })
    const range = root.querySelector<HTMLInputElement>('#bot-count')
    range?.addEventListener('input', () => {
      this.settings.botCount = Number(range.value)
      this.persistSettings()
      range.style.setProperty('--fill', `${((Number(range.value) - 1) / 10) * 100}%`)
      const label = root.querySelector('#bot-count-label')
      if (label) label.textContent = range.value
      const fieldLabel = root.querySelector('label[for="bot-count"]')
      if (fieldLabel) fieldLabel.textContent = `Hostiles · ${range.value}`
    })
    const bindTeamRange = (id: 'ally-count' | 'enemy-count', key: 'allyBots' | 'enemyBots', title: string) => {
      const input = root.querySelector<HTMLInputElement>(`#${id}`)
      input?.addEventListener('input', () => {
        this.settings[key] = Number(input.value)
        this.persistSettings()
        input.style.setProperty('--fill', `${(Number(input.value) / 8) * 100}%`)
        const label = root.querySelector(`#${id}-label`)
        if (label) label.textContent = input.value
        const fieldLabel = root.querySelector(`label[for="${id}"]`)
        if (fieldLabel) fieldLabel.textContent = `${title} · ${input.value}`
      })
    }
    bindTeamRange('ally-count', 'allyBots', 'Allies')
    bindTeamRange('enemy-count', 'enemyBots', 'Enemies')
    root.querySelector('[data-action="start"]')?.addEventListener('click', () => {
      this.persistSettings()
      this.onStart?.(this.settings)
    })
  }
}
