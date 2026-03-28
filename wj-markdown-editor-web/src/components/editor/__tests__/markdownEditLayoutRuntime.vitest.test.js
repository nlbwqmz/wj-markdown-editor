import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, onBeforeUnmount } from 'vue'

import MarkdownEdit from '../MarkdownEdit.vue'

function createFakeRef(value) {
  return {
    __v_isRef: true,
    value,
  }
}

const splitState = vi.hoisted(() => ({
  calls: [],
  destroySpies: [],
}))

const previewLayoutWiringState = vi.hoisted(() => ({
  rebuildPreviewLayoutIndex: vi.fn(() => 0),
  jumpToTargetLine: vi.fn(),
  syncEditorToPreview: vi.fn(),
  syncPreviewToEditor: vi.fn(),
  bindEvents: vi.fn(),
  unbindEvents: vi.fn(),
  clearScrollTimer: vi.fn(),
  cancelScheduledCursorHighlight: vi.fn(),
  clearAllLinkedHighlight: vi.fn(),
  clearLinkedHighlightDisplay: vi.fn(),
  highlightByEditorCursor: vi.fn(),
  onPreviewAreaClick: vi.fn(),
  restorePreviewLinkedHighlight: vi.fn(),
}))

const markdownPreviewStubState = vi.hoisted(() => ({
  instances: [],
  nextId: 0,
}))

vi.mock('split-grid', () => ({
  default(options) {
    const destroy = vi.fn()
    splitState.calls.push(options)
    splitState.destroySpies.push(destroy)
    return {
      destroy,
    }
  },
}))

const storeState = vi.hoisted(() => ({
  current: null,
}))

vi.mock('vue-i18n', () => ({
  createI18n() {
    return {}
  },
  useI18n() {
    return {
      t(key) {
        return key
      },
    }
  },
}))

function createStubComponent(name) {
  return defineComponent({
    name,
    setup(_props, { attrs, slots }) {
      return () => h('div', attrs, slots.default ? slots.default() : [])
    },
  })
}

vi.mock('@/components/editor/EditorSearchBar.vue', () => ({
  default: createStubComponent('EditorSearchBarStub'),
}))

vi.mock('@/components/editor/EditorToolbar.vue', () => ({
  default: createStubComponent('EditorToolbarStub'),
}))

vi.mock('@/components/editor/ImageNetworkModal.vue', () => ({
  default: createStubComponent('ImageNetworkModalStub'),
}))

vi.mock('@/components/editor/MarkdownMenu.vue', () => ({
  default: createStubComponent('MarkdownMenuStub'),
}))

vi.mock('@/components/editor/MarkdownPreview.vue', () => ({
  default: defineComponent({
    name: 'MarkdownPreviewStub',
    props: {
      previewRefreshEpoch: {
        type: Number,
        default: 0,
      },
    },
    setup(props, { attrs, emit }) {
      const instanceRecord = {
        id: ++markdownPreviewStubState.nextId,
        getPreviewRefreshEpoch: () => props.previewRefreshEpoch,
        emitRefreshComplete(epoch = props.previewRefreshEpoch) {
          emit('refresh-complete', epoch)
        },
        unmounted: false,
      }
      markdownPreviewStubState.instances.push(instanceRecord)

      onBeforeUnmount(() => {
        instanceRecord.unmounted = true
      })

      return () => h('div', attrs)
    },
  }),
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return storeState.current
  },
}))

vi.mock('@/components/editor/composables/markdownEditScrollAnchorCaptureUtil.js', () => ({
  createMarkdownEditPreviewScrollAnchorRestore() {
    return () => false
  },
  createMarkdownEditScrollAnchorCapture() {
    return vi.fn(() => ({
      editorCode: null,
      editorPreview: null,
    }))
  },
}))

vi.mock('@/components/editor/composables/selectionUpdateUtil.js', () => ({
  isPointerSelectionUpdate() {
    return false
  },
}))

vi.mock('@/components/editor/composables/useAssetInsert.js', () => ({
  useAssetInsert() {
    return {
      imageNetworkModel: createFakeRef(false),
      imageNetworkData: {},
      imageNetworkDataRules: {},
      insertFileToEditor: vi.fn(),
      openNetworkImageModal: vi.fn(),
      onInsertImgNetwork: vi.fn(),
      pasteOrDrop: vi.fn(),
    }
  },
}))

vi.mock('@/components/editor/composables/useEditorCore.js', () => ({
  useEditorCore() {
    return {
      editorView: createFakeRef(null),
      initEditor: vi.fn(),
      destroyEditor: vi.fn(),
      reconfigureTheme: vi.fn(),
      reconfigureExtensions: vi.fn(),
      reconfigureKeymap: vi.fn(),
    }
  },
}))

vi.mock('@/components/editor/composables/useViewScrollAnchor.js', () => ({
  useViewScrollAnchor() {
    return {
      cancelPendingRestore: vi.fn(),
      scheduleRestoreForCurrentSnapshot: vi.fn(async () => false),
    }
  },
}))

vi.mock('@/components/editor/markdownEditPreviewLayoutIndexWiring.js', () => ({
  createMarkdownEditPreviewLayoutIndexWiring() {
    return {
      rebuildPreviewLayoutIndex: previewLayoutWiringState.rebuildPreviewLayoutIndex,
      previewSync: {
        jumpToTargetLine: previewLayoutWiringState.jumpToTargetLine,
        syncEditorToPreview: previewLayoutWiringState.syncEditorToPreview,
        syncPreviewToEditor: previewLayoutWiringState.syncPreviewToEditor,
        bindEvents: previewLayoutWiringState.bindEvents,
        unbindEvents: previewLayoutWiringState.unbindEvents,
        clearScrollTimer: previewLayoutWiringState.clearScrollTimer,
      },
      associationHighlight: {
        linkedSourceHighlightField: {},
        linkedHighlightThemeStyle: { __v_isRef: true, value: {} },
        cancelScheduledCursorHighlight: previewLayoutWiringState.cancelScheduledCursorHighlight,
        clearAllLinkedHighlight: previewLayoutWiringState.clearAllLinkedHighlight,
        clearLinkedHighlightDisplay: previewLayoutWiringState.clearLinkedHighlightDisplay,
        highlightByEditorCursor: previewLayoutWiringState.highlightByEditorCursor,
        onPreviewAreaClick: previewLayoutWiringState.onPreviewAreaClick,
        restorePreviewLinkedHighlight: previewLayoutWiringState.restorePreviewLinkedHighlight,
      },
    }
  },
}))

vi.mock('@/components/editor/composables/useToolbarBuilder.js', () => ({
  useToolbarBuilder() {
    return {
      buildToolbarList() {
        return []
      },
    }
  },
}))

vi.mock('@/util/editor/flushableDebounceUtil.js', () => ({
  createFlushableDebounce(callback) {
    return {
      schedule: vi.fn(callback),
      flush: vi.fn(() => false),
      hasPending: vi.fn(() => false),
      cancel: vi.fn(),
    }
  },
}))

vi.mock('@/util/editor/keymap/keymapUtil.js', () => ({
  default: {
    createKeymap() {
      return []
    },
  },
}))

vi.mock('@/util/editor/viewScrollAnchorSessionUtil.js', () => ({
  createViewScrollAnchorSessionStore() {
    return {}
  },
}))

vi.mock('@/util/searchBarController.js', () => ({
  previewSearchBarController: {},
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

function createStore({ menuVisible }) {
  return {
    config: {
      menuVisible,
      shortcutKeyList: [],
      theme: {
        global: 'light',
      },
    },
    editorSearchBarVisible: false,
    searchBarVisible: false,
  }
}

async function flushLayoutRender() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function mountMarkdownEdit({
  previewPosition = 'right',
  menuVisible = true,
} = {}) {
  storeState.current = createStore({ menuVisible })

  const wrapper = mount(MarkdownEdit, {
    props: {
      modelValue: '# title',
      previewPosition,
    },
  })

  await flushLayoutRender()
  return wrapper
}

function getLayoutSequence(wrapper) {
  return wrapper
    .get('[data-testid="markdown-edit-layout"]')
    .findAll('[data-layout-item]')
    .map(node => node.attributes('data-layout-item'))
}

function getLayoutStyle(wrapper) {
  return wrapper.get('[data-testid="markdown-edit-layout"]').attributes('style') || ''
}

function getLastMarkdownPreviewStubInstance() {
  return markdownPreviewStubState.instances.at(-1) || null
}

describe('markdownEdit 布局运行时接线', () => {
  beforeEach(() => {
    splitState.calls.length = 0
    splitState.destroySpies.length = 0
    markdownPreviewStubState.instances.length = 0
    markdownPreviewStubState.nextId = 0
    previewLayoutWiringState.rebuildPreviewLayoutIndex.mockClear()
    previewLayoutWiringState.jumpToTargetLine.mockClear()
    previewLayoutWiringState.syncEditorToPreview.mockClear()
    previewLayoutWiringState.syncPreviewToEditor.mockClear()
    previewLayoutWiringState.bindEvents.mockClear()
    previewLayoutWiringState.unbindEvents.mockClear()
    previewLayoutWiringState.clearScrollTimer.mockClear()
    previewLayoutWiringState.cancelScheduledCursorHighlight.mockClear()
    previewLayoutWiringState.clearAllLinkedHighlight.mockClear()
    previewLayoutWiringState.clearLinkedHighlightDisplay.mockClear()
    previewLayoutWiringState.highlightByEditorCursor.mockClear()
    previewLayoutWiringState.onPreviewAreaClick.mockClear()
    previewLayoutWiringState.restorePreviewLinkedHighlight.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    storeState.current = null
  })

  it('左侧双栏布局会按真实 DOM 顺序渲染 preview -> gutter-preview -> editor，并把 preview gutter 绑定给 Split', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'left',
      menuVisible: false,
    })

    expect(getLayoutSequence(wrapper)).toEqual([
      'preview',
      'gutter-preview',
      'editor',
    ])

    expect(splitState.calls).toHaveLength(1)
    expect(splitState.calls[0].columnGutters).toHaveLength(1)
    expect(splitState.calls[0].columnGutters[0].track).toBe(1)
    expect(splitState.calls[0].columnGutters[0].element.dataset.layoutItem).toBe('gutter-preview')
  })

  it('左侧三栏布局会按真实 DOM 顺序渲染 menu -> gutter-menu -> preview -> gutter-preview -> editor，并保持 Split gutter 顺序一致', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'left',
      menuVisible: true,
    })

    expect(getLayoutSequence(wrapper)).toEqual([
      'menu',
      'gutter-menu',
      'preview',
      'gutter-preview',
      'editor',
    ])

    expect(splitState.calls.length).toBeGreaterThanOrEqual(1)
    const latestSplitCall = splitState.calls.at(-1)
    expect(latestSplitCall.columnGutters.map(item => item.track)).toEqual([1, 3])
    expect(latestSplitCall.columnGutters.map(item => item.element.dataset.layoutItem)).toEqual([
      'gutter-menu',
      'gutter-preview',
    ])
  })

  it('previewPosition 从 right 切到 left 时，会重建 Split 并同步新的真实 DOM 顺序', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
      menuVisible: true,
    })

    expect(getLayoutSequence(wrapper)).toEqual([
      'editor',
      'gutter-preview',
      'preview',
      'gutter-menu',
      'menu',
    ])
    expect(splitState.calls.length).toBeGreaterThanOrEqual(1)
    const splitCallCountBeforeSwitch = splitState.calls.length
    const activeSplitDestroySpy = splitState.destroySpies.at(-1)

    await wrapper.setProps({
      previewPosition: 'left',
    })
    await flushLayoutRender()
    vi.runOnlyPendingTimers()

    expect(getLayoutSequence(wrapper)).toEqual([
      'menu',
      'gutter-menu',
      'preview',
      'gutter-preview',
      'editor',
    ])
    expect(splitState.calls.length).toBe(splitCallCountBeforeSwitch + 1)
    expect(activeSplitDestroySpy).toHaveBeenCalledWith(true)
    expect(splitState.calls.at(-1).columnGutters.map(item => item.element.dataset.layoutItem)).toEqual([
      'gutter-menu',
      'gutter-preview',
    ])
  })

  it('切换目录栏和预览区显隐时，不应给布局容器注入宽度过渡样式', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
      menuVisible: true,
    })

    wrapper.vm.$.setupState.menuVisible = false
    await flushLayoutRender()

    expect(getLayoutStyle(wrapper)).not.toContain('transition:')

    wrapper.vm.$.setupState.previewVisible = false
    await flushLayoutRender()

    expect(getLayoutStyle(wrapper)).not.toContain('transition:')
  })

  it('重新打开预览后，应等待 refresh-complete 再执行首轮预览同步和高亮恢复', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
      menuVisible: false,
    })

    previewLayoutWiringState.syncEditorToPreview.mockClear()
    previewLayoutWiringState.restorePreviewLinkedHighlight.mockClear()

    wrapper.vm.$.setupState.previewVisible = false
    await flushLayoutRender()

    previewLayoutWiringState.syncEditorToPreview.mockClear()
    previewLayoutWiringState.restorePreviewLinkedHighlight.mockClear()

    wrapper.vm.$.setupState.previewVisible = true
    await flushLayoutRender()

    expect(previewLayoutWiringState.syncEditorToPreview).not.toHaveBeenCalled()
    expect(previewLayoutWiringState.restorePreviewLinkedHighlight).not.toHaveBeenCalled()

    getLastMarkdownPreviewStubInstance()?.emitRefreshComplete()
    await nextTick()

    expect(previewLayoutWiringState.syncEditorToPreview).toHaveBeenCalledTimes(1)
    expect(previewLayoutWiringState.syncEditorToPreview).toHaveBeenCalledWith(true)
    expect(previewLayoutWiringState.restorePreviewLinkedHighlight).toHaveBeenCalledTimes(1)
  })

  it('等待 reopen 的 refresh-complete 期间再次切换布局时，不应提前消费重同步机会', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
      menuVisible: false,
    })

    wrapper.vm.$.setupState.previewVisible = false
    await flushLayoutRender()

    previewLayoutWiringState.syncEditorToPreview.mockClear()
    previewLayoutWiringState.restorePreviewLinkedHighlight.mockClear()

    wrapper.vm.$.setupState.previewVisible = true
    await flushLayoutRender()
    const reopenedPreviewInstance = getLastMarkdownPreviewStubInstance()

    wrapper.vm.$.setupState.menuVisible = true
    await flushLayoutRender()

    expect(previewLayoutWiringState.syncEditorToPreview).not.toHaveBeenCalled()
    expect(previewLayoutWiringState.restorePreviewLinkedHighlight).not.toHaveBeenCalled()

    reopenedPreviewInstance?.emitRefreshComplete()
    await nextTick()

    expect(previewLayoutWiringState.syncEditorToPreview).toHaveBeenCalledTimes(1)
    expect(previewLayoutWiringState.syncEditorToPreview).toHaveBeenCalledWith(true)
    expect(previewLayoutWiringState.restorePreviewLinkedHighlight).toHaveBeenCalledTimes(1)
  })

  it('旧预览实例卸载后的迟到 refresh-complete 不会触发当前实例的重同步', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
      menuVisible: false,
    })

    const initialPreviewInstance = getLastMarkdownPreviewStubInstance()
    wrapper.vm.$.setupState.previewVisible = false
    await flushLayoutRender()

    previewLayoutWiringState.syncEditorToPreview.mockClear()
    previewLayoutWiringState.restorePreviewLinkedHighlight.mockClear()

    wrapper.vm.$.setupState.previewVisible = true
    await flushLayoutRender()
    const reopenedPreviewInstance = getLastMarkdownPreviewStubInstance()

    expect(initialPreviewInstance?.unmounted).toBe(true)

    initialPreviewInstance?.emitRefreshComplete()
    await nextTick()

    expect(previewLayoutWiringState.syncEditorToPreview).not.toHaveBeenCalled()
    expect(previewLayoutWiringState.restorePreviewLinkedHighlight).not.toHaveBeenCalled()

    reopenedPreviewInstance?.emitRefreshComplete()
    await nextTick()

    expect(previewLayoutWiringState.syncEditorToPreview).toHaveBeenCalledTimes(1)
    expect(previewLayoutWiringState.syncEditorToPreview).toHaveBeenCalledWith(true)
    expect(previewLayoutWiringState.restorePreviewLinkedHighlight).toHaveBeenCalledTimes(1)
  })
})
