import { describe, expect, it } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { repairConfig } from '../configRepairUtil.js'

describe('configRepairUtil', () => {
  it('必须删除不存在的快捷键并补齐缺失项', () => {
    const repaired = repairConfig({
      shortcutKeyList: [{ id: 'unknown', index: 999 }],
    }, defaultConfig)

    expect(repaired.shortcutKeyList.some(item => item.id === 'unknown')).toBe(false)
    expect(repaired.shortcutKeyList.some(item => item.id === 'save')).toBe(true)
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
