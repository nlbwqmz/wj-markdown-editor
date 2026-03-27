import { describe, expect, it } from 'vitest'
import defaultConfig from '../../defaultConfig.js'
import { configVersion } from '../configConstants.js'
import { validateConfigShape } from '../configSchema.js'

describe('configSchema', () => {
  it('当前 defaultConfig 必须通过完整配置校验', () => {
    expect(() => validateConfigShape(defaultConfig)).not.toThrow()
  })

  it('defaultConfig 必须提供 markdown.inlineCodeClickCopy 默认值 false', () => {
    expect(defaultConfig.markdown.inlineCodeClickCopy).toBe(false)
  })

  it('configVersion 必须接纳当前配置版本', () => {
    const validConfig = {
      ...defaultConfig,
      configVersion,
    }

    expect(() => validateConfigShape(validConfig)).not.toThrow()
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

  it('markdown.inlineCodeClickCopy 接纳布尔值 true', () => {
    const validConfig = {
      ...defaultConfig,
      markdown: {
        ...defaultConfig.markdown,
        inlineCodeClickCopy: true,
      },
    }

    expect(() => validateConfigShape(validConfig)).not.toThrow()
  })

  it('editor.previewPosition 必须接纳 left 和 right', () => {
    const leftConfig = {
      ...defaultConfig,
      editor: {
        ...defaultConfig.editor,
        previewPosition: 'left',
      },
    }
    const rightConfig = {
      ...defaultConfig,
      editor: {
        ...defaultConfig.editor,
        previewPosition: 'right',
      },
    }

    expect(() => validateConfigShape(leftConfig)).not.toThrow()
    expect(() => validateConfigShape(rightConfig)).not.toThrow()
  })

  it('editor.previewPosition 非法值必须被拒绝', () => {
    const brokenConfig = {
      ...defaultConfig,
      editor: {
        ...defaultConfig.editor,
        previewPosition: 'bottom',
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
