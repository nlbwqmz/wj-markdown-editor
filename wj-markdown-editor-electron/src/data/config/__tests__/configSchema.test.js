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

  it('defaultConfig 必须提供 markdown.imageShadow 默认值 true', () => {
    expect(defaultConfig.markdown.imageShadow).toBe(true)
  })

  it('defaultConfig 必须提供 sidebarDefaultView 默认值 close', () => {
    expect(defaultConfig.sidebarDefaultView).toBe('close')
  })

  it('defaultConfig 必须提供 sidebarWidth 默认值 280', () => {
    expect(defaultConfig.sidebarWidth).toBe(280)
  })

  it('defaultConfig 必须提供 fileManagerSort 默认值', () => {
    expect(defaultConfig.fileManagerSort).toEqual({
      field: 'type',
      direction: 'asc',
    })
  })

  it('defaultConfig 必须提供 fileManagerLeftClickAction.markdown 默认值 prompt', () => {
    expect(defaultConfig.fileManagerLeftClickAction).toEqual({
      markdown: 'prompt',
    })
  })

  it('defaultConfig 必须提供 fileDefaultDirectory 默认值空字符串', () => {
    expect(defaultConfig.fileDefaultDirectory).toBe('')
  })

  it('config schema 必须接纳 fileDefaultDirectory 字符串', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      fileDefaultDirectory: 'D:/notes',
    })).not.toThrow()
  })

  it('config schema 必须拒绝非字符串 fileDefaultDirectory', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      fileDefaultDirectory: 123,
    })).toThrow()
  })

  it('fileDefaultDirectory 缺失时必须校验失败', () => {
    const brokenConfig = { ...defaultConfig }
    delete brokenConfig.fileDefaultDirectory

    expect(() => validateConfigShape(brokenConfig)).toThrow()
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
      name: '侧边栏切换',
      keymap: '',
      enabled: true,
      type: 'web',
    })
    expect(toggleFileManagerPanelShortcutKey.index).toBe(7)
    expect(editorHeadingShortcutKey.index).toBe(8)
  })

  it('defaultConfig 必须提供源码、双栏、预览三种视图切换快捷键配置', () => {
    const viewSourceShortcutKey = defaultConfig.shortcutKeyList.find(item => item.id === 'viewSource')
    const viewSplitShortcutKey = defaultConfig.shortcutKeyList.find(item => item.id === 'viewSplit')
    const viewPreviewShortcutKey = defaultConfig.shortcutKeyList.find(item => item.id === 'viewPreview')

    expect(viewSourceShortcutKey).toBeDefined()
    expect(viewSourceShortcutKey).toMatchObject({
      id: 'viewSource',
      name: '源码模式',
      keymap: '',
      enabled: true,
      type: 'web',
    })
    expect(viewSourceShortcutKey.index).toBe(5)
    expect(viewSplitShortcutKey).toBeDefined()
    expect(viewSplitShortcutKey).toMatchObject({
      id: 'viewSplit',
      name: '双栏模式',
      keymap: '',
      enabled: true,
      type: 'web',
    })
    expect(viewSplitShortcutKey.index).toBe(5)
    expect(viewPreviewShortcutKey).toBeDefined()
    expect(viewPreviewShortcutKey).toMatchObject({
      id: 'viewPreview',
      name: '预览模式',
      keymap: '',
      enabled: true,
      type: 'web',
    })
    expect(viewPreviewShortcutKey.index).toBe(5)
  })

  it('configVersion 必须接纳当前配置版本', () => {
    const validConfig = {
      ...defaultConfig,
      configVersion,
    }

    expect(() => validateConfigShape(validConfig)).not.toThrow()
  })

  it('defaultConfig 必须提供 startView 默认值 split', () => {
    expect(defaultConfig.startView).toBe('split')
  })

  it('config schema 必须接纳 startView 三态枚举值', () => {
    for (const value of ['source', 'split', 'preview']) {
      expect(() => validateConfigShape({
        ...defaultConfig,
        startView: value,
      })).not.toThrow()
    }
  })

  it('config schema 必须拒绝非法 startView', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      startView: 'editor',
    })).toThrow()
  })

  it('defaultConfig 必须提供 restoreTabs 默认值 onStartup', () => {
    expect(defaultConfig.restoreTabs).toBe('onStartup')
  })

  it('config schema 必须接纳 restoreTabs 三态枚举值', () => {
    for (const value of ['never', 'onStartup', 'always']) {
      expect(() => validateConfigShape({
        ...defaultConfig,
        restoreTabs: value,
      })).not.toThrow()
    }
  })

  it('config schema 必须拒绝非法 restoreTabs', () => {
    // 旧版本的 openRecent 布尔值不能再被当成合法配置。
    for (const value of [true, false, 'invalid', null]) {
      expect(() => validateConfigShape({
        ...defaultConfig,
        restoreTabs: value,
      })).toThrow()
    }
  })

  it('restoreTabs 缺失时必须校验失败', () => {
    const brokenConfig = { ...defaultConfig }
    delete brokenConfig.restoreTabs

    expect(() => validateConfigShape(brokenConfig)).toThrow()
  })

  it('startView 缺失时必须校验失败', () => {
    const brokenConfig = { ...defaultConfig }
    delete brokenConfig.startView

    expect(() => validateConfigShape(brokenConfig)).toThrow()
  })

  it('config schema 必须接纳 sidebarDefaultView 合法枚举值', () => {
    for (const value of ['close', 'files', 'outline']) {
      expect(() => validateConfigShape({
        ...defaultConfig,
        sidebarDefaultView: value,
      })).not.toThrow()
    }
  })

  it('config schema 必须拒绝非法 sidebarDefaultView', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      sidebarDefaultView: 'invalid',
    })).toThrow()
  })

  it('config schema 必须接纳 sidebarWidth', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      sidebarWidth: 300,
    })).not.toThrow()
  })

  it('config schema 必须拒绝越界 sidebarWidth', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      sidebarWidth: 100,
    })).toThrow()
    expect(() => validateConfigShape({
      ...defaultConfig,
      sidebarWidth: 500,
    })).toThrow()
  })

  it('config schema 必须拒绝非数字 sidebarWidth', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      sidebarWidth: '300',
    })).toThrow()
  })

  it('sidebarWidth 缺失时必须校验失败', () => {
    const brokenConfig = { ...defaultConfig }
    delete brokenConfig.sidebarWidth

    expect(() => validateConfigShape(brokenConfig)).toThrow()
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

  it('config schema 必须接纳 fileManagerLeftClickAction.markdown', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      fileManagerLeftClickAction: {
        markdown: 'current-window',
      },
    })).not.toThrow()
  })

  it('config schema 必须拒绝非法 fileManagerLeftClickAction.markdown', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      fileManagerLeftClickAction: {
        markdown: 'ask-every-time',
      },
    })).toThrow()
  })

  it('config schema 必须拒绝非法 fileManagerSort.field', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      fileManagerSort: {
        field: 'size',
        direction: 'asc',
      },
    })).toThrow()
  })

  it('config schema 必须拒绝非法 fileManagerSort.direction', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      fileManagerSort: {
        field: 'type',
        direction: 'up',
      },
    })).toThrow()
  })

  it('config schema 必须拒绝 fileManagerSort 额外属性', () => {
    expect(() => validateConfigShape({
      ...defaultConfig,
      fileManagerSort: {
        field: 'name',
        direction: 'asc',
        extra: true,
      },
    })).toThrow()
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

  it('markdown.imageShadow 接纳布尔值 false', () => {
    const validConfig = {
      ...defaultConfig,
      markdown: {
        ...defaultConfig.markdown,
        imageShadow: false,
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

  it('language 必须接受 auto 与显式语言枚举', () => {
    for (const language of ['auto', 'zh-CN', 'en-US']) {
      expect(() => validateConfigShape({
        ...defaultConfig,
        language,
      })).not.toThrow()
    }
  })

  it('非法 language 必须被识别为 schema 违规', () => {
    const brokenConfig = {
      ...defaultConfig,
      language: 'jp-JP',
    }

    expect(() => validateConfigShape(brokenConfig)).toThrow()
  })
})
