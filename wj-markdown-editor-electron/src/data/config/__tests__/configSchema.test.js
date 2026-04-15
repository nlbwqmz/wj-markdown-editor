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

  it('defaultConfig 必须提供 fileManagerVisible 默认值 true', () => {
    expect(defaultConfig.fileManagerVisible).toBe(true)
  })

  it('defaultConfig 必须提供 fileManagerSort 默认值', () => {
    expect(defaultConfig.fileManagerSort).toEqual({
      field: 'type',
      direction: 'asc',
    })
  })

  it('defaultConfig 必须提供全屏切换与文件管理栏切换快捷键配置', () => {
    const toggleFullScreenShortcutKey = defaultConfig.shortcutKeyList.find(item => item.id === 'toggleFullScreen')
    const toggleFileManagerPanelShortcutKey = defaultConfig.shortcutKeyList.find(item => item.id === 'toggleFileManagerPanel')
    const editorHeadingShortcutKey = defaultConfig.shortcutKeyList.find(item => item.id === 'editor-heading-1')

    expect(toggleFullScreenShortcutKey).toBeDefined()
    expect(toggleFullScreenShortcutKey).toMatchObject({
      id: 'toggleFullScreen',
      name: '全屏切换',
      keymap: 'F11',
      enabled: true,
      type: 'web',
    })
    expect(toggleFullScreenShortcutKey.index).toBe(6)
    expect(toggleFileManagerPanelShortcutKey).toBeDefined()
    expect(toggleFileManagerPanelShortcutKey).toMatchObject({
      id: 'toggleFileManagerPanel',
      name: '文件管理栏切换',
      keymap: '',
      enabled: true,
      type: 'web',
    })
    expect(toggleFileManagerPanelShortcutKey.index).toBe(7)
    expect(editorHeadingShortcutKey.index).toBe(8)
  })

  it('configVersion 必须接纳当前配置版本', () => {
    const validConfig = {
      ...defaultConfig,
      configVersion,
    }

    expect(() => validateConfigShape(validConfig)).not.toThrow()
  })

  it('config schema 必须接纳 fileManagerVisible', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      fileManagerVisible: true,
    })).not.toThrow()
  })

  it('config schema 必须接纳 fileManagerSort', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      fileManagerSort: {
        field: 'modifiedTime',
        direction: 'desc',
      },
    })).not.toThrow()
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

  it('editor.previewPosition 缺失时必须校验失败', () => {
    const brokenConfig = {
      ...defaultConfig,
      editor: {
        associationHighlight: defaultConfig.editor.associationHighlight,
      },
    }

    expect(() => validateConfigShape(brokenConfig)).toThrow()
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
