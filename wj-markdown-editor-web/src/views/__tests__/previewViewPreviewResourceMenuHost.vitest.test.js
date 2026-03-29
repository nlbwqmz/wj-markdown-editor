import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import PreviewView from '../PreviewView.vue'

const previewViewHostState = vi.hoisted(() => {
  return {
    store: null,
    snapshot: null,
    previewResourceContext: null,
    channelSend: vi.fn(),
    messageWarning: vi.fn(),
    messageSuccess: vi.fn(),
    messageError: vi.fn(),
    clipboardWriteText: vi.fn(),
    requestDocumentSessionSnapshot: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    syncClosePromptSnapshot: vi.fn(),
    registerRouteLeave: vi.fn(),
    routerPush: vi.fn(),
    splitDestroy: vi.fn(),
  }
})

function createPreviewResourceContext({
  sourceType = 'remote',
  assetType = 'image',
  markdownReference = '![demo](https://example.com/assets/demo.png)',
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

vi.mock('split-grid', () => ({
  default() {
    return {
      destroy: previewViewHostState.splitDestroy,
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
  onBeforeRouteLeave: previewViewHostState.registerRouteLeave,
  useRouter() {
    return {
      push: previewViewHostState.routerPush,
    }
  },
}))

vi.mock('ant-design-vue', () => ({
  message: {
    warning: previewViewHostState.messageWarning,
    success: previewViewHostState.messageSuccess,
    error: previewViewHostState.messageError,
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
        return () => h('div', { 'data-testid': 'markdown-menu-stub' })
      },
    }),
  }
})

vi.mock('@/components/editor/MarkdownPreview.vue', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'MarkdownPreviewStub',
      emits: ['preview-contextmenu'],
      setup(_props, { emit }) {
        return () => h('div', { 'data-testid': 'markdown-preview-stub' }, [
          h('button', {
            'type': 'button',
            'data-testid': 'emit-preview-resource-context',
            'onClick': () => emit('preview-contextmenu', {
              ...previewViewHostState.previewResourceContext,
              menuPosition: {
                ...previewViewHostState.previewResourceContext.menuPosition,
              },
              asset: {
                ...previewViewHostState.previewResourceContext.asset,
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

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return previewViewHostState.store
  },
}))

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: previewViewHostState.channelSend,
  },
}))

vi.mock('@/util/channel/closePromptSyncService.js', () => ({
  syncClosePromptSnapshot: previewViewHostState.syncClosePromptSnapshot,
}))

vi.mock('@/util/channel/eventEmit.js', () => ({
  default: {
    on: previewViewHostState.addEventListener,
    remove: previewViewHostState.removeEventListener,
  },
}))

vi.mock('@/util/commonUtil.js', () => ({
  default: {
    recentFileNotExists: vi.fn(),
  },
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentSessionSnapshot: previewViewHostState.requestDocumentSessionSnapshot,
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

function createDocumentSessionSnapshot() {
  return {
    sessionId: 'session-preview-menu',
    revision: 5,
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

const TooltipStub = defineComponent({
  name: 'ATooltipStub',
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'tooltip-stub' }, [
      slots.default?.(),
      slots.title?.(),
    ])
  },
})

const EmptyStub = defineComponent({
  name: 'AEmptyStub',
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'empty-stub' }, slots.default?.())
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
        'a-tooltip': TooltipStub,
        'a-empty': EmptyStub,
        'a-button': ButtonStub,
      },
    },
  })

  await flushPreviewView()
  return wrapper
}

async function openPreviewAssetMenu(wrapper, contextOptions = {}) {
  previewViewHostState.previewResourceContext = createPreviewResourceContext(contextOptions)
  await wrapper.get('[data-testid="emit-preview-resource-context"]').trigger('click')
  await nextTick()
}

describe('previewView 预览资源菜单宿主接线', () => {
  beforeEach(() => {
    previewViewHostState.snapshot = createDocumentSessionSnapshot()
    previewViewHostState.store = createStore()
    previewViewHostState.previewResourceContext = createPreviewResourceContext()
    previewViewHostState.channelSend.mockReset()
    previewViewHostState.messageWarning.mockReset()
    previewViewHostState.messageSuccess.mockReset()
    previewViewHostState.messageError.mockReset()
    previewViewHostState.clipboardWriteText.mockReset()
    previewViewHostState.requestDocumentSessionSnapshot.mockReset()
    previewViewHostState.addEventListener.mockReset()
    previewViewHostState.removeEventListener.mockReset()
    previewViewHostState.syncClosePromptSnapshot.mockReset()
    previewViewHostState.registerRouteLeave.mockReset()
    previewViewHostState.routerPush.mockReset()
    previewViewHostState.splitDestroy.mockReset()

    previewViewHostState.clipboardWriteText.mockResolvedValue(undefined)
    previewViewHostState.requestDocumentSessionSnapshot.mockResolvedValue(previewViewHostState.snapshot)
    previewViewHostState.channelSend.mockResolvedValue({
      ok: true,
    })

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: previewViewHostState.clipboardWriteText,
      },
    })
  })

  afterEach(() => {
    previewViewHostState.store = null
  })

  it('纯预览页收到远程图片资源右键事件后，会展示新增非编辑动作且不包含删除项', async () => {
    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
    })

    expect(wrapper.find('[data-menu-key="resource.copy-link"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.copy-image"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.save-as"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.copy-markdown-reference"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.delete"]').exists()).toBe(false)
  })

  it('纯预览页对本地图片资源仍保留 open-in-folder，但不显示删除项', async () => {
    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
      markdownReference: '![demo](assets/demo.png)',
    })

    expect(wrapper.find('[data-menu-key="resource.copy-absolute-path"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.open-in-folder"]').exists()).toBe(true)
    expect(wrapper.find('[data-menu-key="resource.delete"]').exists()).toBe(false)
  })

  it('纯预览页 markdownReference 缺失时不应显示 copy-markdown-reference，若异常触发仍应提示复制失败', async () => {
    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
      markdownReference: null,
    })

    expect(wrapper.find('[data-menu-key="resource.copy-markdown-reference"]').exists()).toBe(false)

    wrapper.findComponent({ name: 'PreviewAssetContextMenuStub' }).vm.$emit('select', 'resource.copy-markdown-reference')
    await flushPreviewView()

    expect(previewViewHostState.channelSend).not.toHaveBeenCalled()
    expect(previewViewHostState.clipboardWriteText).not.toHaveBeenCalled()
    expect(previewViewHostState.messageError).toHaveBeenCalledWith('message.copyFailed')
  })

  it('纯预览页选择 resource.copy-link 时，必须等 runtime 返回文本后才写剪贴板', async () => {
    const deferred = createDeferred()
    previewViewHostState.channelSend.mockImplementation(async ({ event }) => {
      if (event === 'document.resource.copy-link') {
        return await deferred.promise
      }
      return {
        ok: true,
      }
    })

    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
    })
    await wrapper.get('[data-menu-key="resource.copy-link"]').trigger('click')
    await nextTick()

    expect(previewViewHostState.clipboardWriteText).not.toHaveBeenCalled()

    deferred.resolve({
      ok: true,
      text: 'https://example.com/assets/demo.png',
    })
    await flushPreviewView()

    expect(previewViewHostState.clipboardWriteText).toHaveBeenCalledWith('https://example.com/assets/demo.png')
    expect(previewViewHostState.messageSuccess).toHaveBeenCalledWith('message.copySucceeded')
  })

  it('纯预览页选择 resource.copy-link 时，runtime 返回前若组件已卸载，后续 resolve 不得继续写剪贴板或弹提示', async () => {
    const deferred = createDeferred()
    previewViewHostState.channelSend.mockImplementation(async ({ event }) => {
      if (event === 'document.resource.copy-link') {
        return await deferred.promise
      }
      return {
        ok: true,
      }
    })

    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
    })
    await wrapper.get('[data-menu-key="resource.copy-link"]').trigger('click')
    await nextTick()

    expect(previewViewHostState.clipboardWriteText).not.toHaveBeenCalled()
    expect(previewViewHostState.messageSuccess).not.toHaveBeenCalled()
    expect(previewViewHostState.messageError).not.toHaveBeenCalled()
    expect(previewViewHostState.messageWarning).not.toHaveBeenCalled()

    wrapper.unmount()
    deferred.resolve({
      ok: true,
      text: 'https://example.com/assets/demo.png',
    })
    await flushPreviewView()

    expect(previewViewHostState.clipboardWriteText).not.toHaveBeenCalled()
    expect(previewViewHostState.messageSuccess).not.toHaveBeenCalled()
    expect(previewViewHostState.messageError).not.toHaveBeenCalled()
    expect(previewViewHostState.messageWarning).not.toHaveBeenCalled()
  })

  it('纯预览页选择 resource.copy-image 时，会发送 document.resource.copy-image 且不重复写文本剪贴板', async () => {
    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
    })
    await wrapper.get('[data-menu-key="resource.copy-image"]').trigger('click')
    await flushPreviewView()

    expect(previewViewHostState.channelSend).toHaveBeenCalledWith({
      event: 'document.resource.copy-image',
      data: {
        sourceType: 'remote',
        resourceUrl: 'https://example.com/assets/demo.png',
        rawSrc: 'https://example.com/assets/demo.png',
        rawPath: null,
        requestContext: {
          sessionId: 'session-preview-menu',
          documentPath: 'D:/docs/demo.md',
        },
      },
    })
    expect(previewViewHostState.clipboardWriteText).not.toHaveBeenCalled()
    expect(previewViewHostState.messageSuccess).toHaveBeenCalledWith('message.copySucceeded')
  })

  it('纯预览页选择 resource.save-as 时，会发送 document.resource.save-as', async () => {
    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
    })
    await wrapper.get('[data-menu-key="resource.save-as"]').trigger('click')
    await flushPreviewView()

    expect(previewViewHostState.channelSend).toHaveBeenCalledWith({
      event: 'document.resource.save-as',
      data: {
        sourceType: 'remote',
        resourceUrl: 'https://example.com/assets/demo.png',
        rawSrc: 'https://example.com/assets/demo.png',
        rawPath: null,
        requestContext: {
          sessionId: 'session-preview-menu',
          documentPath: 'D:/docs/demo.md',
        },
      },
    })
  })

  it('纯预览页选择 resource.save-as 在非取消失败时，不得展示内部 reason，必须回退到 message.saveAsFailed', async () => {
    previewViewHostState.channelSend.mockResolvedValue({
      ok: false,
      reason: 'write-failed',
      error: {
        message: 'disk exploded',
      },
    })

    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
    })
    await wrapper.get('[data-menu-key="resource.save-as"]').trigger('click')
    await flushPreviewView()

    expect(previewViewHostState.messageError).toHaveBeenCalledWith('message.saveAsFailed')
    expect(previewViewHostState.messageError).not.toHaveBeenCalledWith('write-failed')
    expect(previewViewHostState.messageError).not.toHaveBeenCalledWith('disk exploded')
    expect(previewViewHostState.messageError).not.toHaveBeenCalledWith('save-as-failed')
  })

  it('纯预览页选择 resource.open-in-folder 时，会继续发送 document.resource.open-in-folder', async () => {
    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'local',
      markdownReference: '![demo](assets/demo.png)',
    })
    await wrapper.get('[data-menu-key="resource.open-in-folder"]').trigger('click')
    await flushPreviewView()

    expect(previewViewHostState.channelSend).toHaveBeenCalledWith({
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

  it('纯预览页选择 resource.copy-markdown-reference 时，不经过 runtime，直接写入剪贴板', async () => {
    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
    })
    await wrapper.get('[data-menu-key="resource.copy-markdown-reference"]').trigger('click')
    await flushPreviewView()

    expect(previewViewHostState.channelSend).not.toHaveBeenCalled()
    expect(previewViewHostState.clipboardWriteText).toHaveBeenCalledWith('![demo](https://example.com/assets/demo.png)')
    expect(previewViewHostState.messageSuccess).toHaveBeenCalledWith('message.copySucceeded')
  })

  it('纯预览页选择 resource.copy-markdown-reference 时，剪贴板 promise 挂起期间若组件已卸载，后续 resolve 不得继续弹提示', async () => {
    const deferred = createDeferred()
    previewViewHostState.clipboardWriteText.mockImplementation(async () => {
      await deferred.promise
    })

    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
    })
    await wrapper.get('[data-menu-key="resource.copy-markdown-reference"]').trigger('click')
    await nextTick()

    expect(previewViewHostState.channelSend).not.toHaveBeenCalled()
    expect(previewViewHostState.clipboardWriteText).toHaveBeenCalledWith('![demo](https://example.com/assets/demo.png)')
    expect(previewViewHostState.messageSuccess).not.toHaveBeenCalled()
    expect(previewViewHostState.messageError).not.toHaveBeenCalled()
    expect(previewViewHostState.messageWarning).not.toHaveBeenCalled()

    wrapper.unmount()
    deferred.resolve()
    await flushPreviewView()

    expect(previewViewHostState.messageSuccess).not.toHaveBeenCalled()
    expect(previewViewHostState.messageError).not.toHaveBeenCalled()
    expect(previewViewHostState.messageWarning).not.toHaveBeenCalled()
  })

  it('纯预览页不应出现 resource.delete 菜单项，也不应发送 document.resource.delete-local', async () => {
    const wrapper = await mountPreviewView()

    await openPreviewAssetMenu(wrapper, {
      sourceType: 'remote',
    })

    expect(wrapper.find('[data-menu-key="resource.delete"]').exists()).toBe(false)
    expect(previewViewHostState.channelSend.mock.calls.some(([payload]) => {
      return payload?.event === 'document.resource.delete-local'
    })).toBe(false)
  })
})
