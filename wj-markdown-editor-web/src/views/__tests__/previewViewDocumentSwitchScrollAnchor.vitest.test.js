import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import PreviewView from '../PreviewView.vue'

// 该测试文件刻意不 mock useViewScrollAnchor / viewScrollAnchorSessionUtil /
// viewScrollAnchorMathUtil，用真实基础层验证「同一视图切换文档」的滚动锚点行为。
// 这里只对 useViewScrollAnchor 做旁路包装：保留全部真实行为，仅记录
// resetToTop / scheduleRestoreForCurrentSnapshot 是否被调用。
const documentSwitchState = vi.hoisted(() => ({
  store: null,
  currentSnapshot: null,
  snapshotListener: null,
  requestDocumentSessionSnapshot: vi.fn(),
  registerRouteLeave: vi.fn(),
  routerPush: vi.fn(),
  splitDestroy: vi.fn(),
  syncClosePromptSnapshot: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  publishHandoff: vi.fn(),
  consumeHandoff: vi.fn(),
}))

const previewViewScrollAnchorState = vi.hoisted(() => ({
  resetToTopCalls: 0,
  scheduleRestoreCalls: [],
}))

vi.mock('split-grid', () => ({
  default() {
    return {
      destroy: documentSwitchState.splitDestroy,
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
  onBeforeRouteLeave: documentSwitchState.registerRouteLeave,
  useRouter() {
    return {
      push: documentSwitchState.routerPush,
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
    return documentSwitchState.store
  },
}))

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: vi.fn(),
  },
}))

vi.mock('@/util/channel/closePromptSyncService.js', () => ({
  syncClosePromptSnapshot: documentSwitchState.syncClosePromptSnapshot,
}))

vi.mock('@/util/channel/eventEmit.js', () => ({
  default: {
    on: documentSwitchState.addEventListener,
    remove: documentSwitchState.removeEventListener,
  },
}))

vi.mock('@/util/commonUtil.js', () => ({
  default: {
    recentFileNotExists: vi.fn(),
  },
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentSessionSnapshot: documentSwitchState.requestDocumentSessionSnapshot,
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
  createRendererSessionEventSubscription(options = {}) {
    documentSwitchState.snapshotListener = options.listener
    return {
      activate: vi.fn(),
      deactivate: vi.fn(),
      dispose: vi.fn(),
    }
  },
}))

vi.mock('@/util/document-session/rendererSessionSnapshotController.js', () => ({
  createRendererSessionSnapshotController(options = {}) {
    function applySnapshot(snapshot) {
      options.store?.applyDocumentSessionSnapshot?.(snapshot)
      options.applySnapshot?.(snapshot)
      return snapshot
    }

    return {
      activate: vi.fn(),
      deactivate: vi.fn(),
      dispose: vi.fn(),
      beginBootstrapRequest: vi.fn(() => ({
        type: 'bootstrap',
      })),
      applyBootstrapSnapshot: vi.fn((_requestContext, snapshot) => applySnapshot(snapshot)),
      applyPushedSnapshot: vi.fn(snapshot => applySnapshot(snapshot)),
      replaySnapshot: vi.fn(snapshot => applySnapshot(snapshot)),
      hasAppliedSnapshot: vi.fn(() => true),
      needsBootstrapOnActivate: vi.fn(() => false),
    }
  },
}))

vi.mock('@/util/editor/viewScrollHandoffUtil.js', () => ({
  viewScrollHandoff: {
    publish: documentSwitchState.publishHandoff,
    consume: documentSwitchState.consumeHandoff,
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

vi.mock('@/components/editor/composables/useViewScrollAnchor.js', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    useViewScrollAnchor(options = {}) {
      const anchor = actual.useViewScrollAnchor(options)

      return {
        ...anchor,
        scheduleRestoreForCurrentSnapshot(restoreOptions) {
          previewViewScrollAnchorState.scheduleRestoreCalls.push(restoreOptions)
          return anchor.scheduleRestoreForCurrentSnapshot(restoreOptions)
        },
        resetToTop() {
          previewViewScrollAnchorState.resetToTopCalls += 1
          return anchor.resetToTop()
        },
      }
    },
  }
})

function createSnapshot({
  documentPath = 'D:/docs/a.md',
  sessionId = 'session-a',
  revision = 1,
  content = '# 文档 A',
} = {}) {
  return {
    sessionId,
    revision,
    content,
    fileName: typeof documentPath === 'string' ? documentPath.split('/').at(-1) : null,
    resourceContext: {
      documentPath,
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
  for (let index = 0; index < 10; index++) {
    await nextTick()
    await Promise.resolve()
  }
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

// 把目标快照通过 document.snapshot.changed 推给当前预览页实例。
function pushSnapshot(snapshot) {
  documentSwitchState.currentSnapshot = snapshot
  documentSwitchState.snapshotListener(snapshot)
}

describe('previewView 同一视图切换文档的滚动锚点记忆', () => {
  beforeEach(() => {
    documentSwitchState.store = createStore()
    documentSwitchState.currentSnapshot = createSnapshot()
    documentSwitchState.snapshotListener = null
    documentSwitchState.requestDocumentSessionSnapshot.mockReset()
    documentSwitchState.registerRouteLeave.mockReset()
    documentSwitchState.routerPush.mockReset()
    documentSwitchState.splitDestroy.mockReset()
    documentSwitchState.syncClosePromptSnapshot.mockReset()
    documentSwitchState.addEventListener.mockReset()
    documentSwitchState.removeEventListener.mockReset()
    documentSwitchState.publishHandoff.mockReset()
    documentSwitchState.consumeHandoff.mockReset()
    previewViewScrollAnchorState.resetToTopCalls = 0
    previewViewScrollAnchorState.scheduleRestoreCalls.length = 0

    documentSwitchState.requestDocumentSessionSnapshot.mockImplementation(async () => documentSwitchState.currentSnapshot)
    documentSwitchState.consumeHandoff.mockReturnValue(null)

    // 让布局稳定等待中的 requestAnimationFrame 同步执行，保证恢复链路在 flush 中收敛。
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      value: vi.fn((callback) => {
        callback(0)
        return 1
      }),
    })
  })

  afterEach(() => {
    documentSwitchState.store = null
    documentSwitchState.currentSnapshot = null
    documentSwitchState.snapshotListener = null
  })

  it('同视图切换到无记录的文档 B 时，应把复用的滚动容器归零', async () => {
    const wrapper = await mountPreviewView()
    const scrollElement = wrapper.find('.wj-scrollbar').element

    // 文档 A 滚到中段，并在切换前完成采集
    scrollElement.scrollTop = 480
    await wrapper.vm.$.exposed.requestCurrentWindowOpenPreparation()
    await flushPreviewView()

    pushSnapshot(createSnapshot({
      documentPath: 'D:/docs/b.md',
      sessionId: 'session-b',
      revision: 1,
      content: '# 文档 B',
    }))
    await flushPreviewView()

    expect(scrollElement.scrollTop).toBe(0)
  })

  it('切回已有滚动记录的文档 A 时，应按 documentKey 命中记录并恢复原位置', async () => {
    const wrapper = await mountPreviewView()
    const scrollElement = wrapper.find('.wj-scrollbar').element

    // 文档 A 滚到 480 并采集
    scrollElement.scrollTop = 480
    await wrapper.vm.$.exposed.requestCurrentWindowOpenPreparation()
    await flushPreviewView()

    // 切到无记录的文档 B：先归零
    pushSnapshot(createSnapshot({
      documentPath: 'D:/docs/b.md',
      sessionId: 'session-b',
      revision: 1,
      content: '# 文档 B',
    }))
    await flushPreviewView()
    expect(scrollElement.scrollTop).toBe(0)

    // 文档 B 滚到 120 并采集
    scrollElement.scrollTop = 120
    await wrapper.vm.$.exposed.requestCurrentWindowOpenPreparation()
    await flushPreviewView()

    // 切回文档 A：即使 sessionId / revision 已变化，也应按 documentKey 恢复 480
    pushSnapshot(createSnapshot({
      documentPath: 'D:/docs/a.md',
      sessionId: 'session-a-2',
      revision: 2,
      content: '# 文档 A 再次打开',
    }))
    await flushPreviewView()

    expect(scrollElement.scrollTop).toBe(480)
  })

  it('同一会话内容更新（sessionId 未变）时，不应触发归零或滚动恢复', async () => {
    const wrapper = await mountPreviewView()
    const scrollElement = wrapper.find('.wj-scrollbar').element

    // 文档 A 滚到 360 并采集
    scrollElement.scrollTop = 360
    await wrapper.vm.$.exposed.requestCurrentWindowOpenPreparation()
    await flushPreviewView()

    // 用户继续滚动到 200，此时同一会话内内容发生更新（sessionId 不变）
    scrollElement.scrollTop = 200
    pushSnapshot(createSnapshot({
      documentPath: 'D:/docs/a.md',
      sessionId: 'session-a',
      revision: 2,
      content: '# 文档 A 更新',
    }))
    await flushPreviewView()

    // 既没有被归零，也没有把 360 的旧记录恢复到容器
    expect(scrollElement.scrollTop).toBe(200)
    expect(previewViewScrollAnchorState.resetToTopCalls).toBe(0)
    expect(previewViewScrollAnchorState.scheduleRestoreCalls).toEqual([])
  })

  it('草稿保存获得真实路径（sessionId 未变）时，不应触发归零或滚动恢复', async () => {
    // 先以无路径草稿身份进入预览页：documentKey 为 session:session-draft
    documentSwitchState.currentSnapshot = createSnapshot({
      documentPath: null,
      sessionId: 'session-draft',
      revision: 1,
      content: '# 草稿',
    })
    const wrapper = await mountPreviewView()
    const scrollElement = wrapper.find('.wj-scrollbar').element

    // 草稿滚到 480 并采集
    scrollElement.scrollTop = 480
    await wrapper.vm.$.exposed.requestCurrentWindowOpenPreparation()
    await flushPreviewView()

    // 用户继续滚动到 260，随后保存草稿：sessionId 不变，documentKey 变为真实路径
    scrollElement.scrollTop = 260
    previewViewScrollAnchorState.resetToTopCalls = 0
    previewViewScrollAnchorState.scheduleRestoreCalls.length = 0

    pushSnapshot(createSnapshot({
      documentPath: 'D:/docs/a.md',
      sessionId: 'session-draft',
      revision: 2,
      content: '# 草稿已保存',
    }))
    await flushPreviewView()

    // 草稿保存不是文档切换：不得归零、不得发起滚动恢复，用户当前位置必须保留
    expect(previewViewScrollAnchorState.scheduleRestoreCalls).toEqual([])
    expect(previewViewScrollAnchorState.resetToTopCalls).toBe(0)
    expect(scrollElement.scrollTop).toBe(260)
  })
})
