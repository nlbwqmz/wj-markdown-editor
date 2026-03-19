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
})
