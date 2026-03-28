import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import EditorView from '../EditorView.vue'

const editorViewHostState = vi.hoisted(() => {
  return {
    store: null,
    snapshot: null,
    previewResourceContext: {
      type: 'resource',
      menuPosition: {
        x: 180,
        y: 260,
      },
      asset: {
        kind: 'image',
        rawSrc: 'assets/demo.png',
        rawPath: 'assets/demo.png',
        resourceUrl: 'wj://document-resource/assets/demo.png',
        occurrence: 1,
        lineStart: 1,
        lineEnd: 1,
      },
    },
    channelSend: vi.fn(),
    channelSendSync: vi.fn(),
    modalConfirm: vi.fn(),
    messageWarning: vi.fn(),
    requestDocumentEdit: vi.fn(),
    requestDocumentSave: vi.fn(),
    requestDocumentSessionSnapshot: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    syncClosePromptSnapshot: vi.fn(),
    registerRouteLeave: vi.fn(),
  }
})

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
  onBeforeRouteLeave: editorViewHostState.registerRouteLeave,
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
    warning: editorViewHostState.messageWarning,
  },
  Modal: {
    confirm: editorViewHostState.modalConfirm,
  },
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return editorViewHostState.store
  },
}))

vi.mock('@/components/editor/MarkdownEdit.vue', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'MarkdownEditStub',
      emits: ['preview-contextmenu'],
      setup(_props, { emit }) {
        return () => h('div', { 'data-testid': 'markdown-edit-stub' }, [
          h('button', {
            'type': 'button',
            'data-testid': 'emit-preview-resource-context',
            'onClick': () => emit('preview-contextmenu', {
              ...editorViewHostState.previewResourceContext,
              menuPosition: {
                ...editorViewHostState.previewResourceContext.menuPosition,
              },
              asset: {
                ...editorViewHostState.previewResourceContext.asset,
              },
            }),
          }, 'emit-preview-resource-context'),
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
      props: {
        open: {
          type: Boolean,
          default: false,
        },
        items: {
          type: Array,
          default: () => [],
        },
      },
      emits: ['close', 'select'],
      setup(props, { emit }) {
        return () => h('div', {
          'data-testid': 'preview-asset-context-menu-stub',
          'data-open': String(props.open),
        }, props.items.map(item => h('button', {
          'type': 'button',
          'data-menu-key': item.key,
          'onClick': () => {
            emit('select', item.key)
            emit('close')
          },
        }, item.label)))
      },
    }),
  }
})

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: editorViewHostState.channelSend,
    sendSync: editorViewHostState.channelSendSync,
  },
}))

vi.mock('@/util/channel/closePromptSyncService.js', () => ({
  syncClosePromptSnapshot: editorViewHostState.syncClosePromptSnapshot,
}))

vi.mock('@/util/channel/eventEmit.js', () => ({
  default: {
    on: editorViewHostState.addEventListener,
    remove: editorViewHostState.removeEventListener,
  },
}))

vi.mock('@/util/commonUtil.js', () => ({
  default: {
    recentFileNotExists: vi.fn(),
  },
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentEdit: editorViewHostState.requestDocumentEdit,
  requestDocumentSave: editorViewHostState.requestDocumentSave,
  requestDocumentSessionSnapshot: editorViewHostState.requestDocumentSessionSnapshot,
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
    let hasAppliedSnapshot = false

    function applySnapshot(snapshot) {
      hasAppliedSnapshot = true
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
      hasAppliedSnapshot: vi.fn(() => hasAppliedSnapshot),
      needsBootstrapOnActivate: vi.fn(() => hasAppliedSnapshot !== true),
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

function createDocumentSessionSnapshot() {
  return {
    sessionId: 'session-preview-menu',
    revision: 3,
    content: '![demo](assets/demo.png)\n',
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

const ModalStub = defineComponent({
  name: 'AModalStub',
  props: {
    open: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { slots }) {
    return () => h('div', {
      'data-testid': 'modal-stub',
      'data-open': String(props.open),
    }, [
      slots.title?.(),
      props.open ? slots.default?.() : null,
      slots.footer?.(),
    ])
  },
})

const ButtonStub = defineComponent({
  name: 'AButtonStub',
  setup(_props, { attrs, slots }) {
    return () => h('button', {
      type: 'button',
      onClick: attrs.onClick,
    }, slots.default?.())
  },
})

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
        'a-modal': ModalStub,
        'a-button': ButtonStub,
      },
    },
  })

  await flushEditorView()
  return wrapper
}

describe('editorView 预览资源菜单宿主接线', () => {
  beforeEach(() => {
    editorViewHostState.snapshot = createDocumentSessionSnapshot()
    editorViewHostState.store = createStore()
    editorViewHostState.channelSend.mockReset()
    editorViewHostState.channelSendSync.mockReset()
    editorViewHostState.modalConfirm.mockReset()
    editorViewHostState.messageWarning.mockReset()
    editorViewHostState.requestDocumentEdit.mockReset()
    editorViewHostState.requestDocumentSave.mockReset()
    editorViewHostState.requestDocumentSessionSnapshot.mockReset()
    editorViewHostState.addEventListener.mockReset()
    editorViewHostState.removeEventListener.mockReset()
    editorViewHostState.syncClosePromptSnapshot.mockReset()
    editorViewHostState.registerRouteLeave.mockReset()

    editorViewHostState.modalConfirm.mockImplementation(() => ({
      destroy: vi.fn(),
    }))
    editorViewHostState.requestDocumentEdit.mockResolvedValue({
      snapshot: editorViewHostState.snapshot,
    })
    editorViewHostState.requestDocumentSave.mockResolvedValue(undefined)
    editorViewHostState.requestDocumentSessionSnapshot.mockResolvedValue(editorViewHostState.snapshot)
    editorViewHostState.channelSend.mockImplementation(async ({ event }) => {
      if (event === 'resource.get-info') {
        return {
          ok: true,
          exists: true,
          isFile: true,
        }
      }
      return {
        ok: true,
      }
    })
  })

  afterEach(() => {
    editorViewHostState.store = null
  })

  it('收到 MarkdownEdit 抛出的资源右键事件后，会把真实菜单项传给 PreviewAssetContextMenu', async () => {
    const wrapper = await mountEditorView()

    expect(wrapper.get('[data-testid="preview-asset-context-menu-stub"]').attributes('data-open')).toBe('false')

    await wrapper.get('[data-testid="emit-preview-resource-context"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="preview-asset-context-menu-stub"]').attributes('data-open')).toBe('true')
    expect(wrapper.find('[data-menu-key="resource.open-in-folder"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.delete"]').exists()).toBe(true)
  })

  it('选择 resource.open-in-folder 时，会沿用现有打开目录逻辑发出 document.resource.open-in-folder', async () => {
    const wrapper = await mountEditorView()

    await wrapper.get('[data-testid="emit-preview-resource-context"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-menu-key="resource.open-in-folder"]').trigger('click')
    await flushEditorView()

    expect(editorViewHostState.channelSend).toHaveBeenCalledWith({
      event: 'document.resource.open-in-folder',
      data: {
        resourceUrl: 'wj://document-resource/assets/demo.png',
        rawPath: 'assets/demo.png',
        requestContext: {
          sessionId: 'session-preview-menu',
          documentPath: 'D:/docs/demo.md',
        },
      },
    })
  })

  it('选择 resource.delete 时，会真正触发现有删除流程入口并拉起单引用确认', async () => {
    const wrapper = await mountEditorView()

    await wrapper.get('[data-testid="emit-preview-resource-context"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-menu-key="resource.delete"]').trigger('click')
    await flushEditorView()

    expect(editorViewHostState.channelSend).toHaveBeenCalledWith({
      event: 'resource.get-info',
      data: {
        resourceUrl: 'wj://document-resource/assets/demo.png',
        requestContext: {
          sessionId: 'session-preview-menu',
          documentPath: 'D:/docs/demo.md',
        },
      },
    })
    expect(editorViewHostState.modalConfirm).toHaveBeenCalledTimes(1)
    expect(editorViewHostState.modalConfirm.mock.calls[0][0]).toEqual(expect.objectContaining({
      title: 'prompt',
      okText: 'okText',
      cancelText: 'cancelText',
      onOk: expect.any(Function),
    }))
  })
})
