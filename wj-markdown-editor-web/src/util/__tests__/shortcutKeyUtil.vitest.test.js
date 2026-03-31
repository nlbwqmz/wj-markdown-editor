import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sharedToggleFullScreenAction } = vi.hoisted(() => ({
  sharedToggleFullScreenAction: vi.fn(),
}))

const { mockedStore } = vi.hoisted(() => ({
  mockedStore: {
    fileManagerPanelVisible: true,
    setFileManagerPanelVisible: vi.fn(),
  },
}))

vi.mock('@/router/index.js', () => ({
  default: {
    currentRoute: {
      value: {
        name: 'editor',
      },
    },
    push: vi.fn(),
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

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentOpenDialog: vi.fn(() => Promise.resolve()),
  requestDocumentSave: vi.fn(() => Promise.resolve()),
  requestDocumentSaveCopy: vi.fn(() => Promise.resolve()),
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
  mockedStore.fileManagerPanelVisible = true
  mockedStore.setFileManagerPanelVisible.mockReset()
  mockedStore.setFileManagerPanelVisible.mockImplementation((visible) => {
    mockedStore.fileManagerPanelVisible = visible
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

  it('toggleFileManagerPanel handler 必须复用 store 文件管理栏开关动作', () => {
    const handler = shortcutKeyUtil.getWebShortcutKeyHandler('toggleFileManagerPanel')

    expect(handler).toBeTypeOf('function')

    handler()

    expect(mockedStore.setFileManagerPanelVisible).toHaveBeenCalledWith(false)
    expect(mockedStore.fileManagerPanelVisible).toBe(false)

    handler()

    expect(mockedStore.setFileManagerPanelVisible).toHaveBeenLastCalledWith(true)
    expect(mockedStore.fileManagerPanelVisible).toBe(true)
  })
})
