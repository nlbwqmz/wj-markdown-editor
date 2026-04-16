import { describe, expect, it } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { applyConfigMutationRequest } from '../configMutationExecutor.js'
import { validateConfigShape } from '../configSchema.js'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

describe('applyConfigMutationRequest', () => {
  it('按白名单路径更新 theme.global', () => {
    const inputConfig = cloneValue(defaultConfig)
    const originalConfig = cloneValue(inputConfig)
    const nextConfig = applyConfigMutationRequest(inputConfig, {
      operations: [
        { type: 'set', path: ['theme', 'global'], value: 'dark' },
      ],
    })

    expect(nextConfig.theme.global).toBe('dark')
    expect(nextConfig.theme.code).toBe(defaultConfig.theme.code)
    expect(inputConfig).toEqual(originalConfig)
    expect(() => validateConfigShape(nextConfig)).not.toThrow()
  })

  it('按下标只更新固定长度数组 watermark.gap', () => {
    const inputConfig = cloneValue(defaultConfig)
    const originalConfig = cloneValue(inputConfig)
    const nextConfig = applyConfigMutationRequest(inputConfig, {
      operations: [
        { type: 'set', path: ['watermark', 'gap', 0], value: 180 },
      ],
    })

    expect(nextConfig.watermark.gap).toEqual([180, 100])
    expect(inputConfig).toEqual(originalConfig)
  })

  it('允许更新设置页现有的 editorExtension 与 imageBed 字段', () => {
    const inputConfig = cloneValue(defaultConfig)
    const originalConfig = cloneValue(inputConfig)
    const nextConfig = applyConfigMutationRequest(inputConfig, {
      operations: [
        { type: 'set', path: ['editorExtension', 'lineNumbers'], value: false },
        { type: 'set', path: ['imageBed', 'uploader'], value: 'smms' },
        { type: 'set', path: ['imageBed', 'smms', 'token'], value: 'smms-token' },
        { type: 'set', path: ['imageBed', 'github', 'customUrl'], value: 'https://cdn.example.com' },
      ],
    })

    expect(nextConfig.editorExtension.lineNumbers).toBe(false)
    expect(nextConfig.imageBed.uploader).toBe('smms')
    expect(nextConfig.imageBed.smms.token).toBe('smms-token')
    expect(nextConfig.imageBed.github.customUrl).toBe('https://cdn.example.com')
    expect(inputConfig).toEqual(originalConfig)
  })

  it('按 id 更新快捷键字段', () => {
    const inputConfig = cloneValue(defaultConfig)
    const originalConfig = cloneValue(inputConfig)
    const nextConfig = applyConfigMutationRequest(inputConfig, {
      operations: [
        { type: 'setShortcutKeyField', id: 'save', field: 'enabled', value: false },
      ],
    })

    expect(nextConfig.shortcutKeyList.find(item => item.id === 'save')?.enabled).toBe(false)
    expect(inputConfig).toEqual(originalConfig)
  })

  it('按集合语义切换 autoSave 选项', () => {
    const inputConfig = cloneValue(defaultConfig)
    inputConfig.autoSave = ['close']
    const originalConfig = cloneValue(inputConfig)
    const nextConfig = applyConfigMutationRequest(inputConfig, {
      operations: [
        { type: 'setAutoSaveOption', option: 'blur', enabled: true },
      ],
    })

    expect(nextConfig.autoSave).toEqual(['close', 'blur'])
    expect(new Set(nextConfig.autoSave).size).toBe(nextConfig.autoSave.length)
    expect(inputConfig).toEqual(originalConfig)
  })

  it('重复启用已有 autoSave 选项时不得重复插入', () => {
    const inputConfig = cloneValue(defaultConfig)
    inputConfig.autoSave = ['close']
    const originalConfig = cloneValue(inputConfig)
    const nextConfig = applyConfigMutationRequest(inputConfig, {
      operations: [
        { type: 'setAutoSaveOption', option: 'close', enabled: true },
      ],
    })

    expect(nextConfig.autoSave).toEqual(['close'])
    expect(new Set(nextConfig.autoSave).size).toBe(nextConfig.autoSave.length)
    expect(inputConfig).toEqual(originalConfig)
  })

  it('未知快捷键 id 时抛出异常', () => {
    expect(() => applyConfigMutationRequest(cloneValue(defaultConfig), {
      operations: [
        { type: 'setShortcutKeyField', id: 'missing', field: 'enabled', value: false },
      ],
    })).toThrow(/未找到快捷键/)
  })

  it('reset 返回默认配置副本', () => {
    const inputConfig = cloneValue(defaultConfig)
    inputConfig.theme.global = 'dark'

    const nextConfig = applyConfigMutationRequest(inputConfig, {
      operations: [
        { type: 'reset' },
      ],
    })

    expect(nextConfig).toEqual(defaultConfig)
    expect(nextConfig).not.toBe(defaultConfig)
  })

  it('快捷键字段写入非法值时抛出异常', () => {
    expect(() => applyConfigMutationRequest(cloneValue(defaultConfig), {
      operations: [
        { type: 'setShortcutKeyField', id: 'save', field: 'enabled', value: 'false' },
      ],
    })).toThrow(/配置结构不合法/)
  })

  it('set 写入非法枚举值时抛出异常', () => {
    expect(() => applyConfigMutationRequest(cloneValue(defaultConfig), {
      operations: [
        { type: 'set', path: ['theme', 'global'], value: 'solarized' },
      ],
    })).toThrow(/配置结构不合法/)
  })
})
