import { describe, expect, it } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { applyConfigMutationRequest } from '../configMutationExecutor.js'

describe('applyConfigMutationRequest', () => {
  it('按白名单路径更新 theme.global', () => {
    const nextConfig = applyConfigMutationRequest(defaultConfig, {
      operations: [
        { type: 'set', path: ['theme', 'global'], value: 'dark' },
      ],
    })

    expect(nextConfig.theme.global).toBe('dark')
    expect(nextConfig.theme.code).toBe(defaultConfig.theme.code)
  })

  it('按下标只更新固定长度数组 watermark.gap', () => {
    const nextConfig = applyConfigMutationRequest(defaultConfig, {
      operations: [
        { type: 'set', path: ['watermark', 'gap', 0], value: 180 },
      ],
    })

    expect(nextConfig.watermark.gap).toEqual([180, 100])
  })

  it('按 id 更新快捷键字段', () => {
    const nextConfig = applyConfigMutationRequest(defaultConfig, {
      operations: [
        { type: 'setShortcutKeyField', id: 'save', field: 'enabled', value: false },
      ],
    })

    expect(nextConfig.shortcutKeyList.find(item => item.id === 'save')?.enabled).toBe(false)
  })

  it('按集合语义切换 autoSave 选项', () => {
    const nextConfig = applyConfigMutationRequest(defaultConfig, {
      operations: [
        { type: 'setAutoSaveOption', option: 'blur', enabled: true },
      ],
    })

    expect(nextConfig.autoSave).toEqual(['blur'])
  })
})
