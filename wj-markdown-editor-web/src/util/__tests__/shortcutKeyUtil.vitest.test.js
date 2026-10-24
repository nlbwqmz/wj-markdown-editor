import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sharedToggleFullScreenAction } = vi.hoisted(() => ({
  sharedToggleFullScreenAction: vi.fn(),
}))

const { mockedStore } = vi.hoisted(() => ({
  mockedStore: {
    sidebarVisible: true,
    setSidebarVisible: vi.fn(),
    setViewMode: vi.fn(),
    documentSessionSnapshot: {
      tabs: [{ sessionId: 'session-1' }, { sessionId: 'session-2' }, { sessionId: 'session-3' }],
      activeSessionId: 'session-1',
    },
  },
}))

function setWorkspaceTabs({ sessionIdList, activeSessionId }) {
  mockedStore.documentSessionSnapshot = {
    tabs: sessionIdList.map(sessionId => ({ sessionId })),
    activeSessionId,
  }
}

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/util/fullScreenActionUtil.js', () => ({
  default: sharedToggleFullScreenAction,
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore: () => mockedStore,
}))

vi.mock('@/util/document-session/documentOpenInteractionService.js', () => ({
  requestDocumentOpenByDialogAndOpen: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/util/document-session/currentWindowOpenPreparationService.js', () => ({
  requestCurrentWindowOpenPreparation: vi.fn(() => Promise.resolve({ ok: true })),
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentSave: vi.fn(() => Promise.resolve()),
  requestDocumentSaveCopy: vi.fn(() => Promise.resolve()),
  requestDocumentActivateTab: vi.fn(() => Promise.resolve()),
  requestDocumentCloseTab: vi.fn(() => Promise.resolve()),
}))

const functionKeyCodeList = Array.from({ length: 12 }, (_, index) => `F${index + 1}`)

let shortcutKeyUtil

function createKeyboardEvent(code, options = {}) {
  return {
    code,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...options,
  }
}

beforeEach(async () => {
  vi.resetModules()
  sharedToggleFullScreenAction.mockReset()
  mockedStore.sidebarVisible = true
  mockedStore.setSidebarVisible.mockReset()
  mockedStore.setSidebarVisible.mockImplementation((visible) => {
    mockedStore.sidebarVisible = visible
  })
  mockedStore.setViewMode.mockReset()
  setWorkspaceTabs({
    sessionIdList: ['session-1', 'session-2', 'session-3'],
    activeSessionId: 'session-1',
  })
  shortcutKeyUtil = (await import('../shortcutKeyUtil.js')).default
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('shortcutKeyUtil', () => {
  it.each(functionKeyCodeList)('%s 单键必须是合法快捷键', (functionKeyCode) => {
    const keyboardEvent = createKeyboardEvent(functionKeyCode)

    expect(shortcutKeyUtil.isShortcutKey(keyboardEvent)).toBe(true)
    expect(shortcutKeyUtil.getShortcutKey(keyboardEvent)).toBe(functionKeyCode)
  })

  it('普通字母单键不是合法快捷键', () => {
    const keyboardEvent = createKeyboardEvent('KeyA')

    expect(shortcutKeyUtil.isShortcutKey(keyboardEvent)).toBe(false)
  })

  it('toggleFullScreen handler 必须复用共享 fullScreenActionUtil 动作', async () => {
    const handler = shortcutKeyUtil.getWebShortcutKeyHandler('toggleFullScreen')
    const { default: channelUtil } = await import('@/util/channel/channelUtil.js')

    expect(handler).toBeTypeOf('function')
    expect(handler).toBe(sharedToggleFullScreenAction)

    handler()

    expect(sharedToggleFullScreenAction).toHaveBeenCalledTimes(1)
    expect(channelUtil.send).not.toHaveBeenCalled()
  })

  it('openFile handler 选中的路径必须回流到统一打开交互 service', async () => {
    const handler = shortcutKeyUtil.getWebShortcutKeyHandler('openFile')
    const { requestDocumentOpenByDialogAndOpen } = await import('@/util/document-session/documentOpenInteractionService.js')

    expect(handler).toBeTypeOf('function')

    handler()

    expect(requestDocumentOpenByDialogAndOpen).toHaveBeenCalledWith({
      entrySource: 'shortcut-open-file',
      trigger: 'user',
    })
  })

  it('viewSource handler 必须将视图模式切换为 source', () => {
    const handler = shortcutKeyUtil.getWebShortcutKeyHandler('viewSource')

    expect(handler).toBeTypeOf('function')

    handler()

    expect(mockedStore.setViewMode).toHaveBeenCalledWith('source')
  })

  it('viewSplit handler 必须将视图模式切换为 split', () => {
    const handler = shortcutKeyUtil.getWebShortcutKeyHandler('viewSplit')

    expect(handler).toBeTypeOf('function')

    handler()

    expect(mockedStore.setViewMode).toHaveBeenCalledWith('split')
  })

  it('viewPreview handler 必须将视图模式切换为 preview', () => {
    const handler = shortcutKeyUtil.getWebShortcutKeyHandler('viewPreview')

    expect(handler).toBeTypeOf('function')

    handler()

    expect(mockedStore.setViewMode).toHaveBeenCalledWith('preview')
  })

  it('toggleFileManagerPanel handler 必须复用 store 侧边栏开关动作', () => {
    const handler = shortcutKeyUtil.getWebShortcutKeyHandler('toggleFileManagerPanel')

    expect(handler).toBeTypeOf('function')

    handler()

    expect(mockedStore.setSidebarVisible).toHaveBeenCalledWith(false)
    expect(mockedStore.sidebarVisible).toBe(false)

    handler()

    expect(mockedStore.setSidebarVisible).toHaveBeenLastCalledWith(true)
    expect(mockedStore.sidebarVisible).toBe(true)
  })
  it('nextTab / prevTab handler 必须按标签栏顺序切换活动标签', async () => {
    const { requestDocumentActivateTab } = await import('@/util/document-session/rendererDocumentCommandUtil.js')

    shortcutKeyUtil.getWebShortcutKeyHandler('nextTab')()
    await vi.waitFor(() => {
      expect(requestDocumentActivateTab).toHaveBeenLastCalledWith('session-2', { autoSave: true })
    })

    setWorkspaceTabs({
      sessionIdList: ['session-1', 'session-2', 'session-3'],
      activeSessionId: 'session-2',
    })
    shortcutKeyUtil.getWebShortcutKeyHandler('prevTab')()
    await vi.waitFor(() => {
      expect(requestDocumentActivateTab).toHaveBeenLastCalledWith('session-1', { autoSave: true })
    })
  })

  it('切换标签越过两端时必须回绕', async () => {
    const { requestDocumentActivateTab } = await import('@/util/document-session/rendererDocumentCommandUtil.js')

    setWorkspaceTabs({
      sessionIdList: ['session-1', 'session-2', 'session-3'],
      activeSessionId: 'session-3',
    })
    shortcutKeyUtil.getWebShortcutKeyHandler('nextTab')()
    await vi.waitFor(() => {
      expect(requestDocumentActivateTab).toHaveBeenLastCalledWith('session-1', { autoSave: true })
    })

    setWorkspaceTabs({
      sessionIdList: ['session-1', 'session-2', 'session-3'],
      activeSessionId: 'session-1',
    })
    shortcutKeyUtil.getWebShortcutKeyHandler('prevTab')()
    await vi.waitFor(() => {
      expect(requestDocumentActivateTab).toHaveBeenLastCalledWith('session-3', { autoSave: true })
    })
  })

  it('只有一个标签时切换 handler 不得发送 activate 命令', async () => {
    const { requestDocumentActivateTab } = await import('@/util/document-session/rendererDocumentCommandUtil.js')
    requestDocumentActivateTab.mockClear()

    setWorkspaceTabs({ sessionIdList: ['session-1'], activeSessionId: 'session-1' })
    shortcutKeyUtil.getWebShortcutKeyHandler('nextTab')()
    shortcutKeyUtil.getWebShortcutKeyHandler('prevTab')()
    await Promise.resolve()

    expect(requestDocumentActivateTab).not.toHaveBeenCalled()
  })

  it('closeTab handler 必须关闭当前活动标签', async () => {
    const { requestDocumentCloseTab } = await import('@/util/document-session/rendererDocumentCommandUtil.js')

    shortcutKeyUtil.getWebShortcutKeyHandler('closeTab')()

    await vi.waitFor(() => {
      expect(requestDocumentCloseTab).toHaveBeenCalledWith('session-1')
    })
  })

  it('没有活动标签时 closeTab handler 不得发送关闭命令', async () => {
    const { requestDocumentCloseTab } = await import('@/util/document-session/rendererDocumentCommandUtil.js')
    requestDocumentCloseTab.mockClear()

    setWorkspaceTabs({ sessionIdList: [], activeSessionId: null })
    shortcutKeyUtil.getWebShortcutKeyHandler('closeTab')()
    await Promise.resolve()
    await Promise.resolve()

    expect(requestDocumentCloseTab).not.toHaveBeenCalled()
  })
  it('开启切换时自动保存时，切标签前必须先收敛正文', async () => {
    const { requestDocumentActivateTab } = await import('@/util/document-session/rendererDocumentCommandUtil.js')
    const { requestCurrentWindowOpenPreparation } = await import('@/util/document-session/currentWindowOpenPreparationService.js')
    mockedStore.config = { autoSave: ['switch'] }

    shortcutKeyUtil.getWebShortcutKeyHandler('nextTab')()
    await vi.waitFor(() => {
      expect(requestCurrentWindowOpenPreparation).toHaveBeenCalled()
      expect(requestDocumentActivateTab).toHaveBeenLastCalledWith('session-2', { autoSave: true })
    })
  })

  it('正文收敛失败时必须传 autoSave: false，避免拿旧内容写盘', async () => {
    const { requestDocumentActivateTab } = await import('@/util/document-session/rendererDocumentCommandUtil.js')
    const { requestCurrentWindowOpenPreparation } = await import('@/util/document-session/currentWindowOpenPreparationService.js')
    mockedStore.config = { autoSave: ['switch'] }
    requestCurrentWindowOpenPreparation.mockResolvedValueOnce({ ok: false, reason: 'preparation-unavailable' })

    shortcutKeyUtil.getWebShortcutKeyHandler('nextTab')()
    await vi.waitFor(() => {
      expect(requestDocumentActivateTab).toHaveBeenLastCalledWith('session-2', { autoSave: false })
    })
  })

  it('未开启切换时自动保存时不发起正文收敛', async () => {
    const { requestCurrentWindowOpenPreparation } = await import('@/util/document-session/currentWindowOpenPreparationService.js')
    mockedStore.config = { autoSave: [] }
    requestCurrentWindowOpenPreparation.mockClear()

    shortcutKeyUtil.getWebShortcutKeyHandler('nextTab')()
    await Promise.resolve()
    await Promise.resolve()

    expect(requestCurrentWindowOpenPreparation).not.toHaveBeenCalled()
  })
  it('连按两次切换必须各自生效，不能因快照未刷新而只走一格', async () => {
    const { requestDocumentActivateTab } = await import('@/util/document-session/rendererDocumentCommandUtil.js')
    requestDocumentActivateTab.mockClear()

    let active = 'session-1'
    requestDocumentActivateTab.mockImplementation(async (sessionId) => {
      active = sessionId
      setWorkspaceTabs({
        sessionIdList: ['session-1', 'session-2', 'session-3'],
        activeSessionId: active,
      })
      return { ok: true }
    })

    shortcutKeyUtil.getWebShortcutKeyHandler('nextTab')()
    shortcutKeyUtil.getWebShortcutKeyHandler('nextTab')()

    await vi.waitFor(() => {
      expect(requestDocumentActivateTab).toHaveBeenCalledTimes(2)
    })
    expect(requestDocumentActivateTab.mock.calls.map(call => call[0]))
      .toEqual(['session-2', 'session-3'])
  })
  it('连按两次关闭必须各关一个，不能重复关同一个标签', async () => {
    const { requestDocumentCloseTab } = await import('@/util/document-session/rendererDocumentCommandUtil.js')
    requestDocumentCloseTab.mockClear()

    let tabs = ['session-1', 'session-2']
    requestDocumentCloseTab.mockImplementation(async (sessionId) => {
      await new Promise(resolve => setTimeout(resolve, 10))
      tabs = tabs.filter(id => id !== sessionId)
      setWorkspaceTabs({ sessionIdList: tabs, activeSessionId: tabs[0] ?? null })
      return { ok: true }
    })

    shortcutKeyUtil.getWebShortcutKeyHandler('closeTab')()
    shortcutKeyUtil.getWebShortcutKeyHandler('closeTab')()

    await vi.waitFor(() => {
      expect(requestDocumentCloseTab).toHaveBeenCalledTimes(2)
    })
    expect(requestDocumentCloseTab.mock.calls.map(call => call[0]))
      .toEqual(['session-1', 'session-2'])
  })
})
