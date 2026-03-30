import { beforeEach, describe, expect, it, vi } from 'vitest'

const { store } = vi.hoisted(() => ({
  store: {
    isAlwaysOnTop: false,
    isFullScreen: false,
    hasNewVersion: false,
    isMaximize: false,
    config: {},
  },
}))

const registeredEventHandlerMap = new Map()
const windowNodeState = vi.hoisted(() => ({
  sendToShow: vi.fn(),
}))

vi.mock('ant-design-vue', () => ({
  message: {},
}))

vi.mock('@/i18n/index.js', () => ({
  default: {
    global: {
      t: value => value,
    },
  },
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore: () => store,
}))

vi.mock('@/util/channel/closePromptSyncService.js', () => ({
  syncClosePromptSnapshot: vi.fn(),
}))

vi.mock('@/util/channel/eventEmit.js', () => ({
  default: {
    on: vi.fn((eventName, handler) => {
      registeredEventHandlerMap.set(eventName, handler)
    }),
    publish: vi.fn(),
  },
}))

vi.mock('@/util/document-session/documentSessionEventUtil.js', () => ({
  DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT: 'document.snapshot.changed',
  createDocumentSessionEventHandlers: vi.fn(() => ({})),
}))

describe('eventUtil', () => {
  beforeEach(() => {
    registeredEventHandlerMap.clear()
    store.isAlwaysOnTop = false
    store.isFullScreen = false
    store.hasNewVersion = false
    store.isMaximize = false
    store.config = {}
    windowNodeState.sendToShow.mockReset()
    vi.clearAllMocks()
  })

  it('收到 full-screen-changed 事件后必须同步 store.isFullScreen', async () => {
    const { default: eventUtil } = await import('../eventUtil.js')

    eventUtil.on()

    expect(registeredEventHandlerMap.has('full-screen-changed')).toBe(true)

    const fullScreenChangedHandler = registeredEventHandlerMap.get('full-screen-changed')

    fullScreenChangedHandler(true)
    expect(store.isFullScreen).toBe(true)

    fullScreenChangedHandler(false)
    expect(store.isFullScreen).toBe(false)
  })

  it('eventUtil.link 应把 window.effect.file-manager-directory-changed 原样转发到 eventEmit', async () => {
    const { default: eventUtil } = await import('../eventUtil.js')
    const { default: eventEmit } = await import('../eventEmit.js')
    let bridgeHandler = null

    window.node = {
      sendToShow: windowNodeState.sendToShow.mockImplementation((handler) => {
        bridgeHandler = handler
      }),
    }

    eventUtil.link()
    bridgeHandler({
      event: 'window.effect.file-manager-directory-changed',
      data: {
        directoryPath: 'D:/docs',
      },
    })

    expect(eventEmit.publish).toHaveBeenCalledWith('window.effect.file-manager-directory-changed', {
      directoryPath: 'D:/docs',
    })
  })
})
