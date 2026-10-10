import { describe, expect, it } from 'vitest'

let exportWindowOptionsUtilModule = null

try {
  exportWindowOptionsUtilModule = await import('./exportWindowOptionsUtil.js')
} catch {
  exportWindowOptionsUtilModule = null
}

function requireCreateExportWindowOptions() {
  expect(exportWindowOptionsUtilModule, '缺少 export window options util').toBeTruthy()

  const { createExportWindowOptions } = exportWindowOptionsUtilModule
  expect(typeof createExportWindowOptions).toBe('function')

  return createExportWindowOptions
}

describe('createExportWindowOptions', () => {
  it('隐藏导出窗口应显式关闭后台节流，并保持初始隐藏渲染能力', () => {
    const createExportWindowOptions = requireCreateExportWindowOptions()
    const parentWindow = { id: 1 }

    const options = createExportWindowOptions({
      parentWindow,
      preloadPath: 'D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/preload.js',
    })

    expect(options.show).toBe(false)
    expect(options.parent).toBe(parentWindow)
    expect(options.paintWhenInitiallyHidden).toBe(true)
    expect(options.webPreferences?.backgroundThrottling).toBe(false)
  })

  it('未传主题时应回退为 light，并传递初始主题启动参数', () => {
    const createExportWindowOptions = requireCreateExportWindowOptions()
    const parentWindow = { id: 1 }

    const options = createExportWindowOptions({
      parentWindow,
      preloadPath: 'D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/preload.js',
    })

    expect(options.backgroundColor).toBe('#ffffff')
    expect(options.webPreferences?.additionalArguments).toEqual(['--wj-initial-theme=light'])
  })

  it('传入 dark 主题时应使用深色背景并传递 dark 初始主题启动参数', () => {
    const createExportWindowOptions = requireCreateExportWindowOptions()
    const parentWindow = { id: 1 }

    const options = createExportWindowOptions({
      parentWindow,
      preloadPath: 'D:/code/wj-markdown-editor/wj-markdown-editor-electron/src/preload.js',
      globalTheme: 'dark',
    })

    expect(options.backgroundColor).toBe('#282c34')
    expect(options.webPreferences?.additionalArguments).toEqual(['--wj-initial-theme=dark'])
  })
})
