import { describe, expect, it } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { repairConfig } from '../configRepairUtil.js'

describe('configRepairUtil', () => {
  it('缺失字段必须从 defaultConfig 补齐', () => {
    const repaired = repairConfig({
      theme: {
        preview: 'github',
      },
    }, defaultConfig)

    expect(repaired.menuVisible).toBe(defaultConfig.menuVisible)
    expect(repaired.theme.global).toBe(defaultConfig.theme.global)
  })

  it('默认配置中不存在的旧字段必须被裁掉', () => {
    const repaired = repairConfig({
      legacyField: 'deprecated',
      theme: {
        ...defaultConfig.theme,
        legacyPreviewOption: true,
      },
    }, defaultConfig)

    expect('legacyField' in repaired).toBe(false)
    expect('legacyPreviewOption' in repaired.theme).toBe(false)
  })

  it('必须删除不存在的快捷键并补齐缺失项', () => {
    const repaired = repairConfig({
      shortcutKeyList: [{ id: 'unknown', index: 999 }],
    }, defaultConfig)

    expect(repaired.shortcutKeyList.some(item => item.id === 'unknown')).toBe(false)
    expect(repaired.shortcutKeyList.some(item => item.id === 'save')).toBe(true)
  })

  it('残缺快捷键项按 id 补全时必须使用同 id 的默认字段', () => {
    const repaired = repairConfig({
      shortcutKeyList: [{ id: 'save', index: 999 }],
    }, defaultConfig)

    const saveShortcutKey = repaired.shortcutKeyList.find(item => item.id === 'save')
    const defaultSaveShortcutKey = defaultConfig.shortcutKeyList.find(item => item.id === 'save')

    expect(saveShortcutKey).toBeDefined()
    expect(saveShortcutKey.name).toBe(defaultSaveShortcutKey.name)
    expect(saveShortcutKey.keymap).toBe(defaultSaveShortcutKey.keymap)
    expect(saveShortcutKey.type).toBe(defaultSaveShortcutKey.type)
  })

  it('旧 preview 主题 github-light 必须修正为 github', () => {
    const repaired = repairConfig({
      theme: {
        preview: 'github-light',
      },
    }, defaultConfig)

    expect(repaired.theme.preview).toBe('github')
  })
})
