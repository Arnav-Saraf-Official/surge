import { describe, expect, it } from 'vitest'
import { parseSavedSettings, type MenuSettings } from '../src/ui/menu'

const defaults: MenuSettings = {
  mapId: 'hollow-ward',
  botCount: 7,
  allyBots: 3,
  enemyBots: 4,
  difficulty: 'normal',
  mode: 'ffa',
  loadout: { slots: ['reaper', 'breacher', null, null, null, null, null] },
  upgrades: { vitality: 2, agility: 2, dexterity: 0, focus: 1, grapple: 0, might: 0 },
}

describe('saved menu settings', () => {
  it('restores valid settings and falls back field-by-field for invalid values', () => {
    const restored = parseSavedSettings(
      JSON.stringify({
        version: 1,
        settings: {
          mapId: 'skyfoundry',
          botCount: 99,
          allyBots: 2,
          enemyBots: 6,
          difficulty: 'elite',
          mode: 'training',
          loadout: { slots: ['katana', 'katana', null, null, null, null, null] },
          upgrades: { vitality: 2, agility: 2, dexterity: 0, focus: 1, grapple: 0, might: 0 },
        },
      }),
      defaults,
    )

    expect(restored).toEqual({
      ...defaults,
      mapId: 'skyfoundry',
      allyBots: 2,
      enemyBots: 6,
      difficulty: 'elite',
      mode: 'training',
      loadout: { slots: ['katana', null, null, null, null, null, null] },
    })
  })

  it('uses defaults for absent or unsupported saved data', () => {
    expect(parseSavedSettings(null, defaults)).toEqual(defaults)
    expect(parseSavedSettings('{"version":2,"settings":{}}', defaults)).toEqual(defaults)
  })
})
