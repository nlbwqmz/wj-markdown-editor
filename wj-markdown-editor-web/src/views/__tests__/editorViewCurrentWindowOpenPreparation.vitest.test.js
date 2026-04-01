import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import EditorView from '../EditorView.vue'

const editorPreparationState = vi.hoisted(() => ({
  markdownEditExpose: {
    flushPendingModelSync: vi.fn(),
    captureViewScrollAnchors: vi.fn(),
  },
  store: null,
  requestDocumentEdit: vi.fn(),
  requestDocumentSave: vi.fn(),
  requestDocumentSessionSnapshot: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  syncClosePromptSnapshot: vi.fn(),
  registerRouteLeave: vi.fn(),
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
  onBeforeRouteLeave: editorPreparationState.registerRouteLeave,
}))

vi.mock('@ant-design/icons-vue', () => ({
  ExclamationCircleOutlined: {
    name: 'ExclamationCircleOutlinedStub',
    render() {
      return null
    },
  },
}))

vi.mock('ant-design-vue', () => ({
  message: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  Modal: {
    confirm: vi.fn(() => ({
      destroy: vi.fn(),
    })),
  },
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return editorPreparationState.store
  },
}))

vi.mock('@/components/editor/MarkdownEdit.vue', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'MarkdownEditPreparationStub',
      props: {
        modelValue: {
          type: String,
          default: '',
        },
      },
      emits: ['update:modelValue'],
      setup(props, { emit, expose }) {
        expose(editorPreparationState.markdownEditExpose)
        return () => h('div', { 'data-testid': 'markdown-edit-preparation-stub' }, [
          h('button', {
            'type': 'button',
            'data-testid': 'set-content-latest',
            'onClick': () => emit('update:modelValue', '# 最新正文'),
          }, props.modelValue),
        ])
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

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: vi.fn(),
    sendSync: vi.fn(),
  },
}))

vi.mock('@/util/channel/closePromptSyncService.js', () => ({
  syncClosePromptSnapshot: editorPreparationState.syncClosePromptSnapshot,
}))

vi.mock('@/util/channel/eventEmit.js', () => ({
  default: {
    on: editorPreparationState.addEventListener,
    remove: editorPreparationState.removeEventListener,
  },
}))

vi.mock('@/util/commonUtil.js', () => ({
  default: {
    recentFileNotExists: vi.fn(),
  },
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentEdit: editorPreparationState.requestDocumentEdit,
  requestDocumentSave: editorPreparationState.requestDocumentSave,
  requestDocumentSessionSnapshot: editorPreparationState.requestDocumentSessionSnapshot,
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

vi.mock('@/util/editor/contentUpdateMetaUtil.js', () => ({
  shouldSuppressNextContentSync({ currentContent, nextContent, skipContentSync }) {
    return skipContentSync === true || currentContent === nextContent
  },
}))

vi.mock('@/views/editorViewActivationRestoreScheduler.js', () => ({
  createEditorViewActivationRestoreScheduler() {
    return {
      markPendingRestore: vi.fn(),
      cancelPendingRestore: vi.fn(),
      applySnapshot: vi.fn(),
    }
  },
}))

function createSnapshot({
  sessionId = 'session-editor',
  revision = 5,
  content = '# 旧正文',
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
      editor: {
        associationHighlight: true,
        previewPosition: 'right',
      },
      editorExtension: [],
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

async function flushEditorView() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function mountEditorView() {
  const wrapper = mount(EditorView, {
    global: {
      stubs: {
        'a-modal': defineComponent({
          setup() {
            return () => h('div')
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

  await flushEditorView()
  return wrapper
}

describe('editorView 当前窗口切换前准备', () => {
  beforeEach(() => {
    editorPreparationState.store = createStore()
    editorPreparationState.markdownEditExpose.flushPendingModelSync.mockReset()
    editorPreparationState.markdownEditExpose.captureViewScrollAnchors.mockReset()
    editorPreparationState.requestDocumentEdit.mockReset()
    editorPreparationState.requestDocumentSave.mockReset()
    editorPreparationState.requestDocumentSessionSnapshot.mockReset()
    editorPreparationState.addEventListener.mockReset()
    editorPreparationState.removeEventListener.mockReset()
    editorPreparationState.syncClosePromptSnapshot.mockReset()
    editorPreparationState.registerRouteLeave.mockReset()

    editorPreparationState.requestDocumentSessionSnapshot.mockResolvedValue(createSnapshot())
    editorPreparationState.requestDocumentEdit.mockResolvedValue({
      snapshot: createSnapshot({
        revision: 8,
        content: '# 最新正文',
      }),
    })
  })

  afterEach(() => {
    editorPreparationState.store = null
  })

  it('当前窗口切换前准备命中挂起正文时，必须先 flush，再等待 document.edit 返回最新快照', async () => {
    const wrapper = await mountEditorView()

    await wrapper.get('[data-testid="set-content-latest"]').trigger('click')
    await flushEditorView()

    const result = await wrapper.vm.$.exposed.requestCurrentWindowOpenPreparation()

    expect(editorPreparationState.markdownEditExpose.flushPendingModelSync).toHaveBeenCalledTimes(1)
    expect(editorPreparationState.requestDocumentEdit).toHaveBeenCalledWith('# 最新正文')
    expect(result.snapshot.revision).toBe(8)
  })

  it('当前 content 与 store 快照一致时，应直接走 session snapshot，且不得触发 document.edit', async () => {
    const wrapper = await mountEditorView()
    editorPreparationState.requestDocumentSessionSnapshot.mockClear()
    editorPreparationState.requestDocumentEdit.mockClear()

    const result = await wrapper.vm.$.exposed.requestCurrentWindowOpenPreparation()

    expect(editorPreparationState.markdownEditExpose.flushPendingModelSync).toHaveBeenCalledTimes(1)
    expect(editorPreparationState.requestDocumentSessionSnapshot).toHaveBeenCalledTimes(1)
    expect(editorPreparationState.requestDocumentEdit).not.toHaveBeenCalled()
    expect(result.snapshot.revision).toBe(5)
  })
})
