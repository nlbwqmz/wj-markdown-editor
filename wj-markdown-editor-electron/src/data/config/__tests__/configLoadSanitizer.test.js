import { describe, expect, it } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { sanitizeLoadedConfig } from '../configLoadSanitizer.js'
import { configSchema, validateConfigShape } from '../configSchema.js'

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value))
}

describe('configLoadSanitizer', () => {
  it('非法 const 值必须回退到默认值，且同层其他合法字段仍需保留', () => {
    const defaultValue = {
      mode: 'stable',
      count: 1,
    }

    const sanitized = sanitizeLoadedConfig({
      mode: 'broken',
      count: 5,
    }, defaultValue, {
      type: 'object',
      properties: {
        mode: {
          const: 'stable',
        },
        count: {
          type: 'number',
        },
      },
    })

    expect(sanitized.mode).toBe('stable')
    expect(sanitized.count).toBe(5)
  })

  it('嵌套对象不是 plain object 时必须整对象回退默认值', () => {
    const defaultValue = {
      nested: {
        enabled: true,
        name: '默认名称',
      },
      count: 1,
    }

    const sanitized = sanitizeLoadedConfig({
      nested: new Date('2026-03-24T00:00:00.000Z'),
      count: 7,
    }, defaultValue, {
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
            },
            name: {
              type: 'string',
            },
          },
        },
        count: {
          type: 'number',
        },
      },
    })

    expect(sanitized.nested).toEqual(defaultValue.nested)
    expect(sanitized.count).toBe(7)
  })

  it('对象修复时必须只遍历 schema.properties，额外字段需要被裁掉', () => {
    const defaultValue = {
      nested: {
        enabled: true,
      },
      count: 1,
    }

    const sanitized = sanitizeLoadedConfig({
      nested: {
        enabled: false,
        extra: 'remove-me',
      },
      count: 9,
    }, defaultValue, {
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
            },
          },
        },
        count: {
          type: 'number',
        },
      },
    })

    expect(sanitized.nested).toEqual({ enabled: false })
    expect('extra' in sanitized.nested).toBe(false)
    expect(sanitized.count).toBe(9)
  })

  it('recentMax 为 null 时必须仅回退该字段，其他合法字段保持原值', () => {
    const loadedConfig = {
      ...cloneConfig(defaultConfig),
      recentMax: null,
      theme: {
        ...cloneConfig(defaultConfig.theme),
        global: 'dark',
      },
    }

    const sanitized = sanitizeLoadedConfig(loadedConfig, defaultConfig, configSchema)

    expect(sanitized.recentMax).toBe(defaultConfig.recentMax)
    expect(sanitized.theme.global).toBe('dark')
  })

  it('recentMax 小于最小值时必须裁剪到 0', () => {
    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      recentMax: -1,
    }, defaultConfig, configSchema)

    expect(sanitized.recentMax).toBe(0)
  })

  it('recentMax 大于最大值时必须裁剪到 50', () => {
    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      recentMax: 999,
    }, defaultConfig, configSchema)

    expect(sanitized.recentMax).toBe(50)
  })

  it('recentMax 为小数时必须向下取整为整数，且清洗结果仍可通过 schema', () => {
    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      recentMax: 1.5,
    }, defaultConfig, configSchema)

    expect(sanitized.recentMax).toBe(1)
    expect(() => validateConfigShape(sanitized)).not.toThrow()
  })

  it('非法主题枚举值必须回退到默认值', () => {
    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      theme: {
        ...cloneConfig(defaultConfig.theme),
        global: 'solarized',
      },
    }, defaultConfig, configSchema)

    expect(sanitized.theme.global).toBe(defaultConfig.theme.global)
  })

  it('markdown.inlineCodeClickCopy 缺失时必须补默认值，且同层其他合法字段保持原值', () => {
    const loadedConfig = cloneConfig(defaultConfig)
    delete loadedConfig.markdown.inlineCodeClickCopy
    loadedConfig.markdown.typographer = false

    const sanitized = sanitizeLoadedConfig(loadedConfig, defaultConfig, configSchema)

    expect(sanitized.markdown.inlineCodeClickCopy).toBe(false)
    expect(sanitized.markdown.typographer).toBe(false)
  })

  it('markdown.inlineCodeClickCopy 非法时必须仅回退该字段', () => {
    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      markdown: {
        ...cloneConfig(defaultConfig.markdown),
        inlineCodeClickCopy: 'invalid',
        typographer: false,
      },
    }, defaultConfig, configSchema)

    expect(sanitized.markdown.inlineCodeClickCopy).toBe(false)
    expect(sanitized.markdown.typographer).toBe(false)
  })

  it('autoSave 可变枚举数组必须保留合法项并过滤非法项', () => {
    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      autoSave: ['blur', 'oops'],
    }, defaultConfig, configSchema)

    expect(sanitized.autoSave).toEqual(['blur'])
  })

  it('watermark.gap 固定长度数组中的非法项必须按同下标默认值修复', () => {
    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      watermark: {
        ...cloneConfig(defaultConfig.watermark),
        gap: [100, 'bad'],
      },
    }, defaultConfig, configSchema)

    expect(sanitized.watermark.gap).toEqual([100, defaultConfig.watermark.gap[1]])
  })

  it('shortcutKeyList 对象数组中的非法字段必须仅回退该字段，不影响同项其他合法字段', () => {
    const shortcutKeyList = cloneConfig(defaultConfig.shortcutKeyList)
    shortcutKeyList[0] = {
      ...shortcutKeyList[0],
      enabled: null,
      keymap: 'Ctrl+Alt+N',
    }

    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      shortcutKeyList,
    }, defaultConfig, configSchema)

    expect(sanitized.shortcutKeyList[0].enabled).toBe(defaultConfig.shortcutKeyList[0].enabled)
    expect(sanitized.shortcutKeyList[0].keymap).toBe('Ctrl+Alt+N')
    expect(() => validateConfigShape(sanitized)).not.toThrow()
  })

  it('shortcutKeyList 顺序变化时必须仍按同 id 默认项修复非法字段', () => {
    const shortcutKeyList = cloneConfig(defaultConfig.shortcutKeyList)
    const swappedShortcutKeyList = [shortcutKeyList[1], shortcutKeyList[0], ...shortcutKeyList.slice(2)]

    swappedShortcutKeyList[0] = {
      ...swappedShortcutKeyList[0],
      keymap: null,
    }

    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      shortcutKeyList: swappedShortcutKeyList,
    }, defaultConfig, configSchema)

    expect(sanitized.shortcutKeyList[0].id).toBe('openFile')
    expect(sanitized.shortcutKeyList[0].keymap).toBe(defaultConfig.shortcutKeyList[1].keymap)
    expect(() => validateConfigShape(sanitized)).not.toThrow()
  })

  it('shortcutKeyList 中无默认项可对齐的脏对象必须被过滤，且清洗结果仍可通过 schema', () => {
    const shortcutKeyList = [
      ...cloneConfig(defaultConfig.shortcutKeyList),
      {
        index: 99,
        id: 'custom',
        name: '自定义',
        keymap: 'Ctrl+9',
        enabled: null,
        type: 'web',
      },
    ]

    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      shortcutKeyList,
    }, defaultConfig, configSchema)

    expect(sanitized.shortcutKeyList.some(item => item.id === 'custom')).toBe(false)
    expect(() => validateConfigShape(sanitized)).not.toThrow()
  })

  it('shortcutKeyList 中未知 id 的脏对象插入默认索引范围内时也必须被过滤', () => {
    const shortcutKeyList = cloneConfig(defaultConfig.shortcutKeyList)
    shortcutKeyList.splice(1, 0, {
      index: 99,
      id: 'custom',
      name: '自定义',
      keymap: 'Ctrl+9',
      enabled: null,
      type: 'web',
    })

    const sanitized = sanitizeLoadedConfig({
      ...cloneConfig(defaultConfig),
      shortcutKeyList,
    }, defaultConfig, configSchema)

    expect(sanitized.shortcutKeyList.some(item => item.id === 'custom')).toBe(false)
    expect(() => validateConfigShape(sanitized)).not.toThrow()
  })

  it('根对象不是 plain object 时必须整份回退为默认配置', () => {
    const sanitized = sanitizeLoadedConfig([], defaultConfig, configSchema)

    expect(sanitized).toEqual(defaultConfig)
    expect(sanitized).not.toBe(defaultConfig)
  })
})
