import { describe, expect, it } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { validateConfigShape } from '../configSchema.js'

describe('configSchema', () => {
  it('当前 defaultConfig 必须通过完整配置校验', () => {
    expect(() => validateConfigShape(defaultConfig)).not.toThrow()
  })

  it('顶层缺失必需字段时必须校验失败', () => {
    const brokenConfig = { ...defaultConfig }
    delete brokenConfig.theme

    expect(() => validateConfigShape(brokenConfig)).toThrow()
  })

  it('明显损坏的嵌套结构必须被拒绝', () => {
    const brokenConfig = {
      ...defaultConfig,
      theme: 123,
    }

    expect(() => validateConfigShape(brokenConfig)).toThrow()
  })

  it('fontFamily 嵌套结构类型错误时必须校验失败', () => {
    const brokenConfig = {
      ...defaultConfig,
      fontFamily: {
        ...defaultConfig.fontFamily,
        editArea: false,
      },
    }

    expect(() => validateConfigShape(brokenConfig)).toThrow()
  })

  it('markdown 嵌套结构类型错误时必须校验失败', () => {
    const brokenConfig = {
      ...defaultConfig,
      markdown: {
        typographer: 'yes',
      },
    }

    expect(() => validateConfigShape(brokenConfig)).toThrow()
  })

  it('非法 language 必须被识别为 schema 违规', () => {
    const brokenConfig = {
      ...defaultConfig,
      language: 'jp-JP',
    }

    expect(() => validateConfigShape(brokenConfig)).toThrow()
  })
})
