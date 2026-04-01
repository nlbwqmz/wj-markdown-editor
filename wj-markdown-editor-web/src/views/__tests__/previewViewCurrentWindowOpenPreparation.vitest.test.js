import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import PreviewView from '../PreviewView.vue'

const previewPreparationState = vi.hoisted(() => ({
  store: null,
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
  useViewScrollAnchor() {
    return {
      captureCurrentAnchor: vi.fn(),
      cancelPendingRestore: vi.fn(),
      scheduleRestoreForCurrentSnapshot: vi.fn(async () => true),
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
  capturePreviewLineAnchor: vi.fn(() => null),
  resolvePreviewLineAnchorScrollTop: vi.fn(() => 0),
}))

vi.mock('@/util/editor/viewScrollAnchorSessionUtil.js', () => ({
  createViewScrollAnchorSessionStore() {
    return {}
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

async function mountPreviewView() {
  const wrapper = mount(PreviewView, {
    global: {
      mocks: {
        $t(key) {
          return key
        },
      },
      stubs: {
        'a-tooltip': defineComponent({
          setup(_props, { slots }) {
            return () => h('div', slots.default?.())
          },
        }),
        'a-empty': defineComponent({
          setup(_props, { slots }) {
            return () => h('div', slots.default?.())
          },
        }),
        'a-button': defineComponent({
          setup() {
            return () => h('button')
          },
        }),
      },
    },
  })

  await flushPreviewView()
  return wrapper
}

describe('previewView 当前窗口切换前准备降级', () => {
  beforeEach(() => {
    previewPreparationState.store = createStore()
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
})
