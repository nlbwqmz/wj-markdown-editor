import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sharedToggleFullScreenAction } = vi.hoisted(() => ({
  sharedToggleFullScreenAction: vi.fn(),
}))

const { mockedStore } = vi.hoisted(() => ({
  mockedStore: {
    sidebarVisible: true,
    setSidebarVisible: vi.fn(),
    setViewMode: vi.fn(),
  },
}))

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

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentSave: vi.fn(() => Promise.resolve()),
  requestDocumentSaveCopy: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/util/document-session/rendererTabCommandService.js', () => ({
  requestSwitchStep: vi.fn(),
  requestCloseTab: vi.fn(),
  activateTabById: vi.fn(() => Promise.resolve(true)),
  closeTabById: vi.fn(() => Promise.resolve(true)),
  resolveSwitchAutoSaveReady: vi.fn(() => Promise.resolve(true)),
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

  it('标签页快捷键必须只表达意图，具体调度交给标签命令服务', async () => {
    const service = await import('@/util/document-session/rendererTabCommandService.js')

    shortcutKeyUtil.getWebShortcutKeyHandler('switchToNextTab')()
    shortcutKeyUtil.getWebShortcutKeyHandler('switchToPreviousTab')()
    shortcutKeyUtil.getWebShortcutKeyHandler('closeTab')()

    expect(service.requestSwitchStep).toHaveBeenNthCalledWith(1, 'next')
    expect(service.requestSwitchStep).toHaveBeenNthCalledWith(2, 'previous')
    expect(service.requestCloseTab).toHaveBeenCalledTimes(1)
  })
})
