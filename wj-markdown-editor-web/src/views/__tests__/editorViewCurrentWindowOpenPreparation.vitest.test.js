import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import EditorView from '../EditorView.vue'

const editorPreparationState = vi.hoisted(() => ({
  markdownEditExpose: {
    flushPendingModelSync: vi.fn(),
    captureViewScrollAnchors: vi.fn(),
    handleDocumentContextSwitch: vi.fn(),
  },
  store: null,
  requestDocumentEdit: vi.fn(),
  requestDocumentSave: vi.fn(),
  requestDocumentSessionSnapshot: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  syncClosePromptSnapshot: vi.fn(),
  registerRouteLeave: vi.fn(),
  publishHandoff: vi.fn(),
  consumeHandoff: vi.fn(),
  capturedSessionListener: null,
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
  createRendererSessionEventSubscription(options = {}) {
    editorPreparationState.capturedSessionListener = options.listener
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
      applyPushedSnapshot: vi.fn((snapshot) => {
        options.applySnapshot?.(snapshot)
      }),
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

vi.mock('@/util/editor/viewScrollHandoffUtil.js', () => ({
  viewScrollHandoff: {
    publish: editorPreparationState.publishHandoff,
    consume: editorPreparationState.consumeHandoff,
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
  documentPath = 'D:/docs/demo.md',
} = {}) {
  return {
    sessionId,
    revision,
    content,
    fileName: 'demo.md',
    resourceContext: {
      documentPath,
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
    editorPreparationState.markdownEditExpose.handleDocumentContextSwitch.mockReset()
    editorPreparationState.requestDocumentEdit.mockReset()
    editorPreparationState.requestDocumentSave.mockReset()
    editorPreparationState.requestDocumentSessionSnapshot.mockReset()
    editorPreparationState.addEventListener.mockReset()
    editorPreparationState.removeEventListener.mockReset()
    editorPreparationState.syncClosePromptSnapshot.mockReset()
    editorPreparationState.registerRouteLeave.mockReset()
    editorPreparationState.publishHandoff.mockReset()
    editorPreparationState.consumeHandoff.mockReset()

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
    editorPreparationState.capturedSessionListener = null
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

  it('路由离开时，应把编辑区阅读行号发布给跨视图交接容器', async () => {
    await mountEditorView()
    editorPreparationState.markdownEditExpose.captureViewScrollAnchors.mockReturnValue({
      editorCode: {
        anchor: {
          type: 'editor-line',
          lineNumber: 42,
          lineOffsetRatio: 0.5,
        },
      },
      editorPreview: null,
    })

    const routeLeaveCallback = editorPreparationState.registerRouteLeave.mock.calls.at(-1)?.[0]
    expect(typeof routeLeaveCallback).toBe('function')

    await routeLeaveCallback()

    // 采集入口必须收到完整 snapshot，而不是被上层预先解析过的 identity。
    expect(editorPreparationState.markdownEditExpose.captureViewScrollAnchors).toHaveBeenCalledWith(createSnapshot())
    expect(editorPreparationState.publishHandoff).toHaveBeenCalledWith({
      sessionId: 'session-editor',
      revision: 5,
      lineNumber: 42,
      lineOffsetRatio: 0.5,
      sourceAreaKey: 'editor-code',
    })
  })

  it('当前窗口切换前准备会把完整 snapshot 交给滚动锚点采集', async () => {
    const wrapper = await mountEditorView()
    editorPreparationState.markdownEditExpose.captureViewScrollAnchors.mockClear()

    await wrapper.vm.$.exposed.requestCurrentWindowOpenPreparation()

    expect(editorPreparationState.markdownEditExpose.captureViewScrollAnchors).toHaveBeenCalledWith(createSnapshot())
  })

  it('推送快照切换到另一文档时，应转发文档切换滚动处理', async () => {
    await mountEditorView()
    editorPreparationState.markdownEditExpose.handleDocumentContextSwitch.mockClear()

    const nextSnapshot = createSnapshot({
      sessionId: 'session-next',
      revision: 0,
      content: '# 新文档',
      documentPath: 'D:/docs/next.md',
    })
    await editorPreparationState.capturedSessionListener(nextSnapshot)

    expect(editorPreparationState.markdownEditExpose.handleDocumentContextSwitch).toHaveBeenCalledTimes(1)
    expect(editorPreparationState.markdownEditExpose.handleDocumentContextSwitch).toHaveBeenCalledWith(nextSnapshot)
  })

  it('同一文档的内容更新不触发文档切换滚动处理', async () => {
    await mountEditorView()
    editorPreparationState.markdownEditExpose.handleDocumentContextSwitch.mockClear()

    await editorPreparationState.capturedSessionListener(createSnapshot({
      revision: 6,
      content: '# 旧正文更新',
    }))

    expect(editorPreparationState.markdownEditExpose.handleDocumentContextSwitch).not.toHaveBeenCalled()
  })

  it('草稿保存获得真实路径（sessionId 未变）时，不应触发文档切换滚动处理', async () => {
    // 先以无路径草稿身份完成首次加载：documentKey 为 session:session-draft
    editorPreparationState.requestDocumentSessionSnapshot.mockResolvedValue(createSnapshot({
      sessionId: 'session-draft',
      revision: 1,
      content: '# 草稿',
      documentPath: null,
    }))
    const wrapper = await mountEditorView()
    editorPreparationState.markdownEditExpose.handleDocumentContextSwitch.mockClear()

    // 保存草稿：sessionId 不变，documentKey 从 session:session-draft 变为真实路径
    await editorPreparationState.capturedSessionListener(createSnapshot({
      sessionId: 'session-draft',
      revision: 2,
      content: '# 草稿已保存',
      documentPath: 'D:/docs/a.md',
    }))
    await flushEditorView()

    // 草稿保存不是文档切换：不得转发文档切换滚动处理，正文仍按同一会话正常同步
    expect(editorPreparationState.markdownEditExpose.handleDocumentContextSwitch).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="set-content-latest"]').text()).toBe('# 草稿已保存')
  })

  it('路由离开时若编辑区没有合法行号，不得发布交接记录', async () => {
    await mountEditorView()
    editorPreparationState.markdownEditExpose.captureViewScrollAnchors.mockReturnValue({
      editorCode: {
        anchor: {
          type: 'editor-line',
          lineNumber: 0,
          lineOffsetRatio: 0,
        },
      },
      editorPreview: null,
    })

    const routeLeaveCallback = editorPreparationState.registerRouteLeave.mock.calls.at(-1)?.[0]
    await routeLeaveCallback()

    expect(editorPreparationState.publishHandoff).not.toHaveBeenCalled()
  })
})
