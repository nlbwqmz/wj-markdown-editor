import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import EditorView from '../EditorView.vue'

const editorViewHostState = vi.hoisted(() => {
  return {
    store: null,
    snapshot: null,
    previewResourceContext: null,
    channelSend: vi.fn(),
    channelSendSync: vi.fn(),
    modalConfirm: vi.fn(),
    messageWarning: vi.fn(),
    messageSuccess: vi.fn(),
    messageError: vi.fn(),
    clipboardWriteText: vi.fn(),
    requestDocumentEdit: vi.fn(),
    requestDocumentSave: vi.fn(),
    requestDocumentSessionSnapshot: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    syncClosePromptSnapshot: vi.fn(),
    registerRouteLeave: vi.fn(),
  }
})

function createPreviewResourceContext({
  sourceType = 'local',
  assetType = 'image',
  markdownReference = '![demo](assets/demo.png)',
} = {}) {
  return {
    type: 'resource',
    menuPosition: {
      x: 180,
      y: 260,
    },
    asset: {
      assetType,
      sourceType,
      rawSrc: sourceType === 'remote' ? 'https://example.com/assets/demo.png' : 'assets/demo.png',
      rawPath: sourceType === 'remote' ? null : 'assets/demo.png',
      resourceUrl: sourceType === 'remote'
        ? 'https://example.com/assets/demo.png'
        : 'wj://document-resource/assets/demo.png',
      markdownReference,
      occurrence: 1,
      lineStart: 1,
      lineEnd: 1,
    },
  }
}

function createDeferred() {
  let resolve
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve,
  }
}

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
    success: editorViewHostState.messageSuccess,
    error: editorViewHostState.messageError,
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

async function openPreviewAssetMenu(wrapper, contextOptions = {}) {
  editorViewHostState.previewResourceContext = createPreviewResourceContext(contextOptions)
  await wrapper.get('[data-testid="emit-preview-resource-context"]').trigger('click')
  await nextTick()
}

describe('editorView 预览资源菜单宿主接线', () => {
  beforeEach(() => {
    editorViewHostState.snapshot = createDocumentSessionSnapshot()
    editorViewHostState.store = createStore()
    editorViewHostState.previewResourceContext = createPreviewResourceContext()
    editorViewHostState.channelSend.mockReset()
    editorViewHostState.channelSendSync.mockReset()
    editorViewHostState.modalConfirm.mockReset()
    editorViewHostState.messageWarning.mockReset()
    editorViewHostState.messageSuccess.mockReset()
    editorViewHostState.messageError.mockReset()
    editorViewHostState.clipboardWriteText.mockReset()
    editorViewHostState.requestDocumentEdit.mockReset()
    editorViewHostState.requestDocumentSave.mockReset()
    editorViewHostState.requestDocumentSessionSnapshot.mockReset()
    editorViewHostState.addEventListener.mockReset()
    editorViewHostState.removeEventListener.mockReset()
    editorViewHostState.syncClosePromptSnapshot.mockReset()
    editorViewHostState.registerRouteLeave.mockReset()

    editorViewHostState.clipboardWriteText.mockResolvedValue(undefined)
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

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: editorViewHostState.clipboardWriteText,
      },
    })
  })

  afterEach(() => {
    editorViewHostState.store = null
  })

  it('收到 MarkdownEdit 抛出的本地图片资源右键事件后，会把新增菜单项和删除项一起传给 PreviewAssetContextMenu', async () => {
    const wrapper = await mountEditorView()

    expect(wrapper.get('[data-testid="preview-asset-context-menu-stub"]').attributes('data-open')).toBe('false')

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
    })

    expect(wrapper.get('[data-testid="preview-asset-context-menu-stub"]').attributes('data-open')).toBe('true')
    expect(wrapper.find('[data-menu-key="resource.copy-absolute-path"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.copy-image"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.save-as"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.open-in-folder"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.copy-markdown-reference"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.delete"]').exists()).toBe(true)
  })

  it('收到 MarkdownEdit 抛出的远程图片资源右键事件后，会显示 copy-link 菜单项', async () => {
    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
      markdownReference: '![demo](https://example.com/assets/demo.png)',
    })

    expect(wrapper.find('[data-menu-key="resource.copy-link"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.copy-image"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.save-as"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.copy-markdown-reference"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.delete"]').exists()).toBe(true)
  })

  it('markdownReference 缺失时不应显示 copy-markdown-reference，若异常触发仍应提示复制失败', async () => {
    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
      markdownReference: null,
    })

    expect(wrapper.find('[data-menu-key="resource.copy-markdown-reference"]').exists()).toBe(false)

    wrapper.findComponent({ name: 'PreviewAssetContextMenuStub' }).vm.$emit('select', 'resource.copy-markdown-reference')
    await flushEditorView()

    expect(editorViewHostState.channelSend).not.toHaveBeenCalled()
    expect(editorViewHostState.clipboardWriteText).not.toHaveBeenCalled()
    expect(editorViewHostState.messageError).toHaveBeenCalledWith('message.copyFailed')
  })

  it('选择 resource.copy-image 时，会发送 document.resource.copy-image，且不重复写文本剪贴板', async () => {
    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
    })
    await wrapper.get('[data-menu-key="resource.copy-image"]').trigger('click')
    await flushEditorView()

    expect(editorViewHostState.channelSend).toHaveBeenCalledWith({
      event: 'document.resource.copy-image',
      data: {
        sourceType: 'local',
        resourceUrl: 'wj://document-resource/assets/demo.png',
        rawSrc: 'assets/demo.png',
        rawPath: 'assets/demo.png',
        requestContext: {
          sessionId: 'session-preview-menu',
          documentPath: 'D:/docs/demo.md',
        },
      },
    })
    expect(editorViewHostState.clipboardWriteText).not.toHaveBeenCalled()
    expect(editorViewHostState.messageSuccess).toHaveBeenCalledWith('message.copySucceeded')
  })

  it('选择 resource.copy-absolute-path 时，必须等 runtime 返回文本后才写剪贴板', async () => {
    const deferred = createDeferred()
    editorViewHostState.channelSend.mockImplementation(async ({ event }) => {
      if (event === 'document.resource.copy-absolute-path') {
        return await deferred.promise
      }
      return {
        ok: true,
      }
    })

    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
    })
    await wrapper.get('[data-menu-key="resource.copy-absolute-path"]').trigger('click')
    await nextTick()

    expect(editorViewHostState.clipboardWriteText).not.toHaveBeenCalled()

    deferred.resolve({
      ok: true,
      text: 'D:/docs/assets/demo.png',
    })
    await flushEditorView()

    expect(editorViewHostState.clipboardWriteText).toHaveBeenCalledWith('D:/docs/assets/demo.png')
    expect(editorViewHostState.messageSuccess).toHaveBeenCalledWith('message.copySucceeded')
  })

  it('选择 resource.copy-link 时，必须等 runtime 返回文本后才写剪贴板', async () => {
    const deferred = createDeferred()
    editorViewHostState.channelSend.mockImplementation(async ({ event }) => {
      if (event === 'document.resource.copy-link') {
        return await deferred.promise
      }
      return {
        ok: true,
      }
    })

    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
      markdownReference: '![demo](https://example.com/assets/demo.png)',
    })
    await wrapper.get('[data-menu-key="resource.copy-link"]').trigger('click')
    await nextTick()

    expect(editorViewHostState.clipboardWriteText).not.toHaveBeenCalled()

    deferred.resolve({
      ok: true,
      text: 'https://example.com/assets/demo.png',
    })
    await flushEditorView()

    expect(editorViewHostState.clipboardWriteText).toHaveBeenCalledWith('https://example.com/assets/demo.png')
    expect(editorViewHostState.messageSuccess).toHaveBeenCalledWith('message.copySucceeded')
  })

  it('选择 resource.copy-link 时，runtime 返回前若组件已卸载，后续 resolve 不得继续写剪贴板或弹提示', async () => {
    const deferred = createDeferred()
    editorViewHostState.channelSend.mockImplementation(async ({ event }) => {
      if (event === 'document.resource.copy-link') {
        return await deferred.promise
      }
      return {
        ok: true,
      }
    })

    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
      markdownReference: '![demo](https://example.com/assets/demo.png)',
    })
    await wrapper.get('[data-menu-key="resource.copy-link"]').trigger('click')
    await nextTick()

    expect(editorViewHostState.clipboardWriteText).not.toHaveBeenCalled()
    expect(editorViewHostState.messageSuccess).not.toHaveBeenCalled()
    expect(editorViewHostState.messageError).not.toHaveBeenCalled()
    expect(editorViewHostState.messageWarning).not.toHaveBeenCalled()

    wrapper.unmount()
    deferred.resolve({
      ok: true,
      text: 'https://example.com/assets/demo.png',
    })
    await flushEditorView()

    expect(editorViewHostState.clipboardWriteText).not.toHaveBeenCalled()
    expect(editorViewHostState.messageSuccess).not.toHaveBeenCalled()
    expect(editorViewHostState.messageError).not.toHaveBeenCalled()
    expect(editorViewHostState.messageWarning).not.toHaveBeenCalled()
  })

  it('选择 resource.copy-markdown-reference 时，不经过 runtime，直接写入剪贴板', async () => {
    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
    })
    await wrapper.get('[data-menu-key="resource.copy-markdown-reference"]').trigger('click')
    await flushEditorView()

    expect(editorViewHostState.channelSend).not.toHaveBeenCalled()
    expect(editorViewHostState.clipboardWriteText).toHaveBeenCalledWith('![demo](assets/demo.png)')
    expect(editorViewHostState.messageSuccess).toHaveBeenCalledWith('message.copySucceeded')
  })

  it('选择 resource.copy-markdown-reference 时，剪贴板 promise 挂起期间若组件已卸载，后续 resolve 不得继续弹提示', async () => {
    const deferred = createDeferred()
    editorViewHostState.clipboardWriteText.mockImplementation(async () => {
      await deferred.promise
    })

    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
    })
    await wrapper.get('[data-menu-key="resource.copy-markdown-reference"]').trigger('click')
    await nextTick()

    expect(editorViewHostState.channelSend).not.toHaveBeenCalled()
    expect(editorViewHostState.clipboardWriteText).toHaveBeenCalledWith('![demo](assets/demo.png)')
    expect(editorViewHostState.messageSuccess).not.toHaveBeenCalled()
    expect(editorViewHostState.messageError).not.toHaveBeenCalled()
    expect(editorViewHostState.messageWarning).not.toHaveBeenCalled()

    wrapper.unmount()
    deferred.resolve()
    await flushEditorView()

    expect(editorViewHostState.messageSuccess).not.toHaveBeenCalled()
    expect(editorViewHostState.messageError).not.toHaveBeenCalled()
    expect(editorViewHostState.messageWarning).not.toHaveBeenCalled()
  })

  it('选择 resource.save-as 在 runtime 返回 cancelled 时必须静默结束', async () => {
    editorViewHostState.channelSend.mockResolvedValue({
      ok: false,
      cancelled: true,
      reason: 'cancelled',
    })

    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
    })
    await wrapper.get('[data-menu-key="resource.save-as"]').trigger('click')
    await flushEditorView()

    expect(editorViewHostState.channelSend).toHaveBeenCalledWith({
      event: 'document.resource.save-as',
      data: {
        sourceType: 'local',
        resourceUrl: 'wj://document-resource/assets/demo.png',
        rawSrc: 'assets/demo.png',
        rawPath: 'assets/demo.png',
        requestContext: {
          sessionId: 'session-preview-menu',
          documentPath: 'D:/docs/demo.md',
        },
      },
    })
    expect(editorViewHostState.messageSuccess).not.toHaveBeenCalled()
    expect(editorViewHostState.messageWarning).not.toHaveBeenCalled()
    expect(editorViewHostState.messageError).not.toHaveBeenCalled()
  })

  it('选择 resource.save-as 在非取消失败时，不得展示内部 reason，必须回退到 message.saveAsFailed', async () => {
    editorViewHostState.channelSend.mockResolvedValue({
      ok: false,
      reason: 'write-failed',
      error: {
        message: 'disk exploded',
      },
    })

    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
    })
    await wrapper.get('[data-menu-key="resource.save-as"]').trigger('click')
    await flushEditorView()

    expect(editorViewHostState.messageError).toHaveBeenCalledWith('message.saveAsFailed')
    expect(editorViewHostState.messageError).not.toHaveBeenCalledWith('write-failed')
    expect(editorViewHostState.messageError).not.toHaveBeenCalledWith('disk exploded')
    expect(editorViewHostState.messageError).not.toHaveBeenCalledWith('save-as-failed')
  })

  it('选择 resource.save-as 在 runtime 返回结构化 messageKey 时，应优先展示该文案', async () => {
    editorViewHostState.channelSend.mockResolvedValue({
      ok: false,
      reason: 'remote-resource-too-large',
      messageKey: 'message.previewAssetRemoteResourceTooLarge',
    })

    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
      markdownReference: '![demo](https://example.com/assets/demo.png)',
    })
    await wrapper.get('[data-menu-key="resource.save-as"]').trigger('click')
    await flushEditorView()

    expect(editorViewHostState.messageWarning).toHaveBeenCalledWith('message.previewAssetRemoteResourceTooLarge')
    expect(editorViewHostState.messageError).not.toHaveBeenCalled()
  })

  it('选择 resource.open-in-folder 时，会沿用现有打开目录逻辑发出 document.resource.open-in-folder', async () => {
    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
    })
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

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
    })
    await wrapper.get('[data-menu-key="resource.delete"]').trigger('click')
    await flushEditorView()

    expect(editorViewHostState.channelSend).toHaveBeenCalledWith({
      event: 'resource.get-info',
      data: {
        resourceUrl: 'wj://document-resource/assets/demo.png',
        rawPath: 'assets/demo.png',
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

  it('单引用确认删除本地资源时，应继续把 rawPath 传给 document.resource.delete-local', async () => {
    editorViewHostState.channelSend.mockImplementation(async ({ event }) => {
      if (event === 'resource.get-info') {
        return {
          ok: true,
          exists: true,
          isFile: true,
        }
      }

      if (event === 'document.resource.delete-local') {
        return {
          ok: true,
          removed: true,
          reason: 'deleted',
          path: 'D:/docs/assets/demo.png',
        }
      }

      return {
        ok: true,
      }
    })

    const wrapper = await mountEditorView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
    })
    await wrapper.get('[data-menu-key="resource.delete"]').trigger('click')
    await flushEditorView()

    await editorViewHostState.modalConfirm.mock.calls[0][0].onOk()
    await flushEditorView()

    expect(editorViewHostState.channelSend).toHaveBeenCalledWith({
      event: 'document.resource.delete-local',
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
})
