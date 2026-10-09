import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick } from 'vue'

import PreviewView from '../PreviewView.vue'

const previewPreparationState = vi.hoisted(() => ({
  store: null,
  anchorStore: {},
  viewScrollAnchorOptions: null,
  captureCurrentAnchor: vi.fn(),
  scheduleRestoreForCurrentSnapshot: vi.fn(),
  capturePreviewLineAnchor: vi.fn(),
  resolvePreviewLineAnchorScrollTop: vi.fn(),
  resolvePreviewLineElement: vi.fn(),
  resolvePreviewLineNumberFromAnchor: vi.fn(),
  resolvePreviewLineNumberOffsetRatio: vi.fn(),
  saveAnchorRecord: vi.fn(),
  publishHandoff: vi.fn(),
  consumeHandoff: vi.fn(),
  requestDocumentEdit: vi.fn(),
  requestDocumentSessionSnapshot: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  syncClosePromptSnapshot: vi.fn(),
  registerRouteLeave: vi.fn(),
  routerPush: vi.fn(),
  splitDestroy: vi.fn(),
}))

vi.mock('split-grid', () => ({
  default() {
    return {
      destroy: previewPreparationState.splitDestroy,
    }
  },
}))

vi.mock('vue-i18n', () => ({
  useI18n() {
    return {
      t(key) {
        return key
      },
    }
  },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: previewPreparationState.registerRouteLeave,
  useRouter() {
    return {
      push: previewPreparationState.routerPush,
    }
  },
}))

vi.mock('ant-design-vue', () => ({
  message: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/components/editor/composables/useViewScrollAnchor.js', () => ({
  useViewScrollAnchor(options = {}) {
    previewPreparationState.viewScrollAnchorOptions = options
    return {
      captureCurrentAnchor: previewPreparationState.captureCurrentAnchor,
      cancelPendingRestore: vi.fn(),
      scheduleRestoreForCurrentSnapshot: previewPreparationState.scheduleRestoreForCurrentSnapshot,
      resetToTop: vi.fn(),
    }
  },
}))

vi.mock('@/components/editor/MarkdownMenu.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'MarkdownMenuStub',
      setup() {
        return () => h('div')
      },
    }),
  }
})

vi.mock('@/components/editor/MarkdownPreview.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'MarkdownPreviewStub',
      setup() {
        return () => h('div', { 'data-testid': 'markdown-preview-stub' })
      },
    }),
  }
})

vi.mock('@/components/editor/PreviewAssetContextMenu.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'PreviewAssetContextMenuStub',
      setup() {
        return () => h('div')
      },
    }),
  }
})

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return previewPreparationState.store
  },
}))

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: vi.fn(),
  },
}))

vi.mock('@/util/channel/closePromptSyncService.js', () => ({
  syncClosePromptSnapshot: previewPreparationState.syncClosePromptSnapshot,
}))

vi.mock('@/util/channel/eventEmit.js', () => ({
  default: {
    on: previewPreparationState.addEventListener,
    remove: previewPreparationState.removeEventListener,
  },
}))

vi.mock('@/util/commonUtil.js', () => ({
  default: {
    recentFileNotExists: vi.fn(),
  },
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentEdit: previewPreparationState.requestDocumentEdit,
  requestDocumentSessionSnapshot: previewPreparationState.requestDocumentSessionSnapshot,
}))

vi.mock('@/util/document-session/rendererSessionActivationStrategy.js', () => ({
  resolveRendererSessionActivationAction() {
    return 'idle'
  },
  shouldBootstrapSessionSnapshotOnMounted() {
    return true
  },
}))

vi.mock('@/util/document-session/rendererSessionEventSubscription.js', () => ({
  createRendererSessionEventSubscription() {
    return {
      activate: vi.fn(),
      deactivate: vi.fn(),
      dispose: vi.fn(),
    }
  },
}))

vi.mock('@/util/document-session/rendererSessionSnapshotController.js', () => ({
  createRendererSessionSnapshotController(options = {}) {
    return {
      activate: vi.fn(),
      deactivate: vi.fn(),
      dispose: vi.fn(),
      beginBootstrapRequest: vi.fn(() => ({
        type: 'bootstrap',
      })),
      applyBootstrapSnapshot: vi.fn((_requestContext, snapshot) => {
        options.store?.applyDocumentSessionSnapshot?.(snapshot)
        options.applySnapshot?.(snapshot)
      }),
      applyPushedSnapshot: vi.fn(),
      replaySnapshot: vi.fn(),
      hasAppliedSnapshot: vi.fn(() => true),
      needsBootstrapOnActivate: vi.fn(() => false),
    }
  },
}))

vi.mock('@/util/editor/viewScrollAnchorMathUtil.js', () => ({
  capturePreviewLineAnchor: previewPreparationState.capturePreviewLineAnchor,
  resolvePreviewLineAnchorScrollTop: previewPreparationState.resolvePreviewLineAnchorScrollTop,
  resolvePreviewLineElement: previewPreparationState.resolvePreviewLineElement,
  resolvePreviewLineNumberFromAnchor: previewPreparationState.resolvePreviewLineNumberFromAnchor,
  resolvePreviewLineNumberOffsetRatio: previewPreparationState.resolvePreviewLineNumberOffsetRatio,
}))

vi.mock('@/util/editor/viewScrollAnchorSessionUtil.js', () => ({
  createViewScrollAnchorSessionStore() {
    return previewPreparationState.anchorStore
  },
  pruneAnchorRecords: vi.fn(),
  saveAnchorRecord: previewPreparationState.saveAnchorRecord,
}))

vi.mock('@/util/editor/viewScrollHandoffUtil.js', () => ({
  viewScrollHandoff: {
    publish: previewPreparationState.publishHandoff,
    consume: previewPreparationState.consumeHandoff,
  },
}))

vi.mock('@/util/searchBarController.js', () => ({
  previewSearchBarController: {
    visible: false,
  },
}))

vi.mock('@/util/searchBarLifecycleUtil.js', () => ({
  closeSearchBarIfVisible: vi.fn(),
}))

vi.mock('@/util/searchTargetBridgeUtil.js', () => ({
  createSearchTargetBridge() {
    return {
      activate: vi.fn(),
      deactivate: vi.fn(),
    }
  },
}))

vi.mock('@/util/searchTargetUtil.js', () => ({
  collectSearchTargetElements() {
    return []
  },
}))

function createSnapshot({
  sessionId = 'session-preview',
  revision = 5,
  content = '# 稳定正文',
} = {}) {
  return {
    sessionId,
    revision,
    content,
    fileName: 'demo.md',
    resourceContext: {
      documentPath: 'D:/docs/demo.md',
    },
  }
}

function createStore() {
  return {
    config: {
      menuVisible: false,
      previewWidth: 100,
      theme: {
        global: 'light',
        code: 'github',
        preview: 'github',
      },
      watermark: {
        enabled: false,
        previewEnabled: false,
        dateEnabled: false,
        content: '',
        datePattern: 'YYYY-MM-DD',
      },
    },
    documentSessionSnapshot: null,
    applyDocumentSessionSnapshot(snapshot) {
      this.documentSessionSnapshot = snapshot
      return snapshot
    },
  }
}

async function flushPreviewView() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

const TooltipStub = defineComponent({
  name: 'ATooltipStub',
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const EmptyStub = defineComponent({
  name: 'AEmptyStub',
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const ButtonStub = defineComponent({
  name: 'AButtonStub',
  setup() {
    return () => h('button')
  },
})

const PreviewViewKeepAliveHost = defineComponent({
  name: 'PreviewViewKeepAliveHost',
  setup() {
    return () => h(KeepAlive, null, {
      default: () => h(PreviewView),
    })
  },
})

function createPreviewViewMountOptions() {
  return {
    mocks: {
      $t(key) {
        return key
      },
    },
    stubs: {
      'a-tooltip': TooltipStub,
      'a-empty': EmptyStub,
      'a-button': ButtonStub,
    },
  }
}

async function mountPreviewView() {
  const wrapper = mount(PreviewView, {
    global: createPreviewViewMountOptions(),
  })

  await flushPreviewView()
  return wrapper
}

async function mountPreviewViewInKeepAlive() {
  const wrapper = mount(PreviewViewKeepAliveHost, {
    global: createPreviewViewMountOptions(),
  })

  await flushPreviewView()
  return wrapper
}

describe('previewView 当前窗口切换前准备降级', () => {
  beforeEach(() => {
    previewPreparationState.store = createStore()
    previewPreparationState.anchorStore = {}
    previewPreparationState.viewScrollAnchorOptions = null
    previewPreparationState.captureCurrentAnchor.mockReset()
    previewPreparationState.scheduleRestoreForCurrentSnapshot.mockReset()
    previewPreparationState.scheduleRestoreForCurrentSnapshot.mockResolvedValue(true)
    previewPreparationState.capturePreviewLineAnchor.mockReset()
    previewPreparationState.capturePreviewLineAnchor.mockReturnValue(null)
    previewPreparationState.resolvePreviewLineAnchorScrollTop.mockReset()
    previewPreparationState.resolvePreviewLineAnchorScrollTop.mockReturnValue(0)
    previewPreparationState.resolvePreviewLineElement.mockReset()
    previewPreparationState.resolvePreviewLineElement.mockReturnValue(null)
    previewPreparationState.resolvePreviewLineNumberFromAnchor.mockReset()
    previewPreparationState.resolvePreviewLineNumberFromAnchor.mockReturnValue(null)
    previewPreparationState.resolvePreviewLineNumberOffsetRatio.mockReset()
    previewPreparationState.resolvePreviewLineNumberOffsetRatio.mockReturnValue(0)
    previewPreparationState.saveAnchorRecord.mockReset()
    previewPreparationState.publishHandoff.mockReset()
    previewPreparationState.consumeHandoff.mockReset()
    previewPreparationState.requestDocumentEdit.mockReset()
    previewPreparationState.requestDocumentSessionSnapshot.mockReset()
    previewPreparationState.addEventListener.mockReset()
    previewPreparationState.removeEventListener.mockReset()
    previewPreparationState.syncClosePromptSnapshot.mockReset()
    previewPreparationState.registerRouteLeave.mockReset()
    previewPreparationState.routerPush.mockReset()
    previewPreparationState.splitDestroy.mockReset()

    previewPreparationState.requestDocumentSessionSnapshot.mockResolvedValue(createSnapshot())
  })

  afterEach(() => {
    previewPreparationState.store = null
  })

  it('预览页下未注册编辑器实例时，应回退到稳定 snapshot 上下文', async () => {
    const wrapper = await mountPreviewView()

    const result = await wrapper.vm.$.exposed.requestCurrentWindowOpenPreparation()

    expect(result.snapshot.revision).toBe(5)
    expect(previewPreparationState.requestDocumentEdit).not.toHaveBeenCalled()
  })

  it('预览页切换前准备时，应按当前文档身份采集锚点并写入 documentKey bucket', async () => {
    const wrapper = await mountPreviewView()

    // 模拟真实 useViewScrollAnchor 的采集行为：按注入的 documentKeyGetter 解析文档身份，
    // 再经 saveAnchorRecord 写入对应的 documentKey bucket。
    previewPreparationState.captureCurrentAnchor.mockImplementation(() => {
      const documentKey = previewPreparationState.viewScrollAnchorOptions.documentKeyGetter()
      return previewPreparationState.saveAnchorRecord(previewPreparationState.anchorStore, {
        documentKey,
        sessionId: previewPreparationState.viewScrollAnchorOptions.sessionIdGetter(),
        scrollAreaKey: previewPreparationState.viewScrollAnchorOptions.scrollAreaKey,
        revision: previewPreparationState.viewScrollAnchorOptions.revisionGetter(),
        anchor: null,
        fallbackScrollTop: 480,
        savedAt: 1,
      })
    })

    await wrapper.vm.$.exposed.requestCurrentWindowOpenPreparation()

    expect(previewPreparationState.captureCurrentAnchor).toHaveBeenCalledTimes(1)
    expect(previewPreparationState.viewScrollAnchorOptions.documentKeyGetter()).toBe('D:/docs/demo.md')
    expect(previewPreparationState.saveAnchorRecord).toHaveBeenCalledWith(
      previewPreparationState.anchorStore,
      expect.objectContaining({
        documentKey: 'D:/docs/demo.md',
        scrollAreaKey: 'preview-page',
      }),
    )
  })

  it('预览页激活恢复前消费到跨视图交接记录时，应写入 preview-page 的 line-handoff 记录', async () => {
    previewPreparationState.consumeHandoff.mockReturnValue({
      sessionId: 'session-preview',
      revision: 5,
      lineNumber: 12,
      sourceAreaKey: 'editor-code',
    })

    await mountPreviewViewInKeepAlive()

    expect(previewPreparationState.consumeHandoff).toHaveBeenCalledWith({
      sessionId: 'session-preview',
      revision: 5,
    })
    expect(previewPreparationState.saveAnchorRecord).toHaveBeenCalledWith(
      previewPreparationState.anchorStore,
      expect.objectContaining({
        documentKey: 'D:/docs/demo.md',
        sessionId: 'session-preview',
        scrollAreaKey: 'preview-page',
        revision: 5,
        anchor: {
          type: 'line-handoff',
          lineNumber: 12,
        },
        fallbackScrollTop: 0,
        savedAt: expect.any(Number),
      }),
    )
    expect(previewPreparationState.scheduleRestoreForCurrentSnapshot).toHaveBeenCalledTimes(1)
  })

  it('预览页激活恢复前未消费到跨视图交接记录时，不得覆盖 preview-page 记录', async () => {
    previewPreparationState.consumeHandoff.mockReturnValue(null)

    await mountPreviewViewInKeepAlive()

    expect(previewPreparationState.consumeHandoff).toHaveBeenCalledWith({
      sessionId: 'session-preview',
      revision: 5,
    })
    expect(previewPreparationState.saveAnchorRecord).not.toHaveBeenCalled()
    expect(previewPreparationState.scheduleRestoreForCurrentSnapshot).toHaveBeenCalledTimes(1)
  })

  it('预览页恢复 line-handoff 锚点时，应先用行号换算预览元素锚点再解析 scrollTop', async () => {
    await mountPreviewView()

    const fakeElement = {
      dataset: {
        lineStart: '10',
        lineEnd: '12',
      },
    }
    const convertedAnchor = {
      type: 'preview-line',
      lineStart: 10,
      lineEnd: 12,
      elementOffsetRatio: 0,
    }
    previewPreparationState.resolvePreviewLineElement.mockReturnValue(fakeElement)
    previewPreparationState.capturePreviewLineAnchor.mockReturnValue(convertedAnchor)
    previewPreparationState.resolvePreviewLineNumberOffsetRatio.mockReturnValue(0.5)
    previewPreparationState.resolvePreviewLineAnchorScrollTop.mockReturnValue(240)

    const scrollElement = {
      scrollTop: 0,
      scrollTo: vi.fn(),
    }
    const restored = previewPreparationState.viewScrollAnchorOptions.restoreAnchor({
      record: {
        sessionId: 'session-preview',
        revision: 5,
        anchor: {
          type: 'line-handoff',
          lineNumber: 11,
          lineOffsetRatio: 0.5,
        },
        fallbackScrollTop: 0,
      },
      scrollElement,
    })

    expect(restored).toBe(true)
    expect(previewPreparationState.resolvePreviewLineElement).toHaveBeenCalled()
    expect(previewPreparationState.capturePreviewLineAnchor).toHaveBeenCalledWith({
      container: scrollElement,
      element: fakeElement,
      scrollTop: 0,
    })
    expect(previewPreparationState.resolvePreviewLineNumberOffsetRatio).toHaveBeenCalledWith({
      lineNumber: 11,
      lineOffsetRatio: 0.5,
      lineStart: 10,
      lineEnd: 12,
    })
    expect(previewPreparationState.resolvePreviewLineAnchorScrollTop).toHaveBeenCalledWith({
      container: scrollElement,
      element: fakeElement,
      anchor: {
        ...convertedAnchor,
        elementOffsetRatio: 0.5,
      },
      fallbackScrollTop: 0,
    })
    expect(scrollElement.scrollTo).toHaveBeenCalledWith({
      top: 240,
    })
  })

  it('预览页恢复 line-handoff 锚点找不到对应元素时，应返回 false 交由上层重试且不得写到顶部', async () => {
    await mountPreviewView()

    previewPreparationState.resolvePreviewLineElement.mockReturnValue(null)

    const scrollElement = {
      scrollTop: 40,
      scrollTo: vi.fn(),
    }
    const restored = previewPreparationState.viewScrollAnchorOptions.restoreAnchor({
      record: {
        sessionId: 'session-preview',
        revision: 5,
        anchor: {
          type: 'line-handoff',
          lineNumber: 11,
        },
        fallbackScrollTop: 0,
      },
      scrollElement,
    })

    expect(restored).toBe(false)
    expect(previewPreparationState.capturePreviewLineAnchor).not.toHaveBeenCalled()
    expect(previewPreparationState.resolvePreviewLineAnchorScrollTop).not.toHaveBeenCalled()
    expect(scrollElement.scrollTo).not.toHaveBeenCalled()
    expect(scrollElement.scrollTop).toBe(40)
  })

  it('预览页路由离开时，应把当前阅读行号发布给跨视图交接容器', async () => {
    previewPreparationState.store.documentSessionSnapshot = {
      sessionId: 'session-preview',
      revision: 5,
    }
    previewPreparationState.captureCurrentAnchor.mockReturnValue({
      sessionId: 'session-preview',
      revision: 5,
      anchor: {
        type: 'preview-line',
        lineStart: 12,
        lineEnd: 14,
        elementOffsetRatio: 0.25,
      },
      fallbackScrollTop: 320,
    })

    previewPreparationState.resolvePreviewLineNumberFromAnchor.mockReturnValue({
      lineNumber: 13,
      lineOffsetRatio: 0.25,
    })

    await mountPreviewView()

    const routeLeaveCallback = previewPreparationState.registerRouteLeave.mock.calls.at(-1)?.[0]
    expect(typeof routeLeaveCallback).toBe('function')

    await routeLeaveCallback()

    expect(previewPreparationState.resolvePreviewLineNumberFromAnchor).toHaveBeenCalledWith({
      type: 'preview-line',
      lineStart: 12,
      lineEnd: 14,
      elementOffsetRatio: 0.25,
    })
    expect(previewPreparationState.publishHandoff).toHaveBeenCalledWith({
      sessionId: 'session-preview',
      revision: 5,
      lineNumber: 13,
      lineOffsetRatio: 0.25,
      sourceAreaKey: 'preview-page',
    })
  })

  it('预览页路由离开时若当前锚点没有合法行号，不得发布交接记录', async () => {
    previewPreparationState.store.documentSessionSnapshot = {
      sessionId: 'session-preview',
      revision: 5,
    }
    previewPreparationState.captureCurrentAnchor.mockReturnValue({
      sessionId: 'session-preview',
      revision: 5,
      anchor: {
        type: 'preview-line',
        lineStart: null,
        lineEnd: null,
        elementOffsetRatio: 0,
      },
      fallbackScrollTop: 320,
    })

    await mountPreviewView()

    const routeLeaveCallback = previewPreparationState.registerRouteLeave.mock.calls.at(-1)?.[0]
    await routeLeaveCallback()

    expect(previewPreparationState.publishHandoff).not.toHaveBeenCalled()
  })
})
