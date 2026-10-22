import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, onBeforeUnmount, reactive } from 'vue'

import { viewScrollHandoff } from '../../../util/editor/viewScrollHandoffUtil.js'

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
  jumpEditorToLine: vi.fn(),
  suppressNextPreviewToEditorSync: vi.fn(),
  resetSuppressedSyncCounters: vi.fn(),
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

const markdownMenuStubState = vi.hoisted(() => ({
  latestShowHeader: null,
}))

const scrollAnchorSessionState = vi.hoisted(() => ({
  store: null,
}))

const viewScrollAnchorState = vi.hoisted(() => ({
  controllers: [],
  restorableAreaKeys: new Set(),
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
  default: defineComponent({
    name: 'MarkdownMenuStub',
    emits: ['anchorNavigate'],
    props: {
      anchorList: {
        type: Array,
        default: () => [],
      },
      getContainer: {
        type: Function,
        default: null,
      },
      close: {
        type: Function,
        default: null,
      },
      showHeader: {
        type: Boolean,
        default: true,
      },
    },
    setup(props, { attrs, slots }) {
      markdownMenuStubState.latestShowHeader = props.showHeader
      return () => h('div', {
        ...attrs,
        'data-show-header': String(props.showHeader),
      }, slots.default ? slots.default() : [])
    },
  }),
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
      isCompositionActive: () => false,
      initEditor: vi.fn(),
      activateEditorView: vi.fn(),
      destroyEditorView: vi.fn(),
      hasEditorView: () => false,
      destroyEditor: vi.fn(),
      reconfigureTheme: vi.fn(),
      reconfigureExtensions: vi.fn(),
      reconfigureKeymap: vi.fn(),
    }
  },
}))

vi.mock('@/components/editor/composables/useViewScrollAnchor.js', () => ({
  useViewScrollAnchor(options = {}) {
    const controller = {
      options,
      cancelPendingRestore: vi.fn(),
      scheduleRestoreForCurrentSnapshot: vi.fn(async () => {
        const documentKey = options.documentKeyGetter?.() ?? ''
        return viewScrollAnchorState.restorableAreaKeys.has(`${documentKey}::${options.scrollAreaKey}`)
      }),
      resetToTop: vi.fn(() => true),
    }
    viewScrollAnchorState.controllers.push(controller)
    return controller
  },
}))

vi.mock('@/components/editor/markdownEditPreviewLayoutIndexWiring.js', () => ({
  createMarkdownEditPreviewLayoutIndexWiring() {
    return {
      rebuildPreviewLayoutIndex: previewLayoutWiringState.rebuildPreviewLayoutIndex,
      previewSync: {
        jumpToTargetLine: previewLayoutWiringState.jumpToTargetLine,
        jumpEditorToLine: previewLayoutWiringState.jumpEditorToLine,
        suppressNextPreviewToEditorSync: previewLayoutWiringState.suppressNextPreviewToEditorSync,
        resetSuppressedSyncCounters: previewLayoutWiringState.resetSuppressedSyncCounters,
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
    scrollAnchorSessionState.store = Object.create(null)
    return scrollAnchorSessionState.store
  },
  clearSessionAnchorRecords(store, documentKey) {
    if (store == null || typeof documentKey !== 'string' || documentKey === '') {
      return
    }
    delete store[documentKey]
  },
  saveAnchorRecord(store, record) {
    if (store == null || typeof record?.sessionId !== 'string' || typeof record?.scrollAreaKey !== 'string') {
      return null
    }

    if (store[record.sessionId] == null) {
      store[record.sessionId] = Object.create(null)
    }

    const nextRecord = {
      ...record,
      anchor: record.anchor != null && typeof record.anchor === 'object'
        ? { ...record.anchor }
        : record.anchor ?? null,
    }
    store[record.sessionId][record.scrollAreaKey] = nextRecord

    return { ...nextRecord }
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

function createStore() {
  return {
    config: {
      shortcutKeyList: [],
      previewWidth: 80,
      theme: {
        global: 'light',
      },
    },
    editorSearchBarVisible: false,
    searchBarVisible: false,
    viewMode: 'split',
    // 每个标签一个 EditorView 后，模板需要从快照里拿到标签列表来渲染容器
    documentSessionSnapshot: {
      activeSessionId: 'test-session',
      tabs: [{ sessionId: 'test-session', fileName: 'test.md', displayPath: null, dirty: false }],
    },
    setViewMode: vi.fn(),
    setOutlineScrollContainer: vi.fn(),
    setOutlineActiveLine: vi.fn(),
    setOutlineNavigateHandler: vi.fn(),
  }
}

async function flushLayoutRender() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function mountMarkdownEdit({
  previewPosition = 'right',
  modelValue = '# title',
} = {}) {
  storeState.current = reactive(createStore())

  const wrapper = mount(MarkdownEdit, {
    props: {
      modelValue,
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
    markdownMenuStubState.latestShowHeader = null
    scrollAnchorSessionState.store = null
    viewScrollAnchorState.controllers.length = 0
    viewScrollAnchorState.restorableAreaKeys.clear()
    viewScrollHandoff.clear()
    previewLayoutWiringState.rebuildPreviewLayoutIndex.mockClear()
    previewLayoutWiringState.jumpToTargetLine.mockClear()
    previewLayoutWiringState.jumpEditorToLine.mockClear()
    previewLayoutWiringState.suppressNextPreviewToEditorSync.mockClear()
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

  it('纯预览布局会保留编辑器 DOM 与预览列，同时隐藏工具栏且不挂 Split 分隔条', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
    })

    const splitCallCountBeforeSwitch = splitState.calls.length
    const activeSplitDestroySpy = splitState.destroySpies.at(-1)
    const layoutElement = wrapper.get('[data-testid="markdown-edit-layout"]')

    storeState.current.viewMode = 'preview'
    await flushLayoutRender()
    vi.runOnlyPendingTimers()

    // editor 列仍然存在于 DOM 中，保证编辑器实例不被销毁。
    expect(wrapper.find('[data-layout-item="editor"]').exists()).toBe(true)
    expect(getLayoutSequence(wrapper)).toEqual([
      'editor',
      'gutter-preview',
      'preview',
    ])
    expect(layoutElement.classes()).toContain('markdown-edit-layout--preview-only')
    // 纯预览态工具栏不渲染，顶部横线需要由布局容器自己补上。
    expect(layoutElement.classes()).toEqual(expect.arrayContaining([
      'b-t-1',
      'b-t-border-primary',
      'b-t-solid',
    ]))
    // 纯预览态没有可拖拽分隔条，gutter 需要隐藏，避免留下多余竖线。
    expect(wrapper.get('[data-layout-item="gutter-preview"]').classes()).toContain('markdown-edit-layout__gutter--preview-hidden')
    expect(wrapper.findComponent({ name: 'EditorToolbarStub' }).exists()).toBe(false)
    // 纯预览布局没有分隔条，不得再创建新的 Split 实例，旧实例必须被释放。
    expect(splitState.calls).toHaveLength(splitCallCountBeforeSwitch)
    expect(activeSplitDestroySpy).toHaveBeenCalledWith(true)

    // 切回双栏后，顶部横线交还给工具栏，gutter 恢复为可拖拽分隔条。
    storeState.current.viewMode = 'split'
    await flushLayoutRender()
    vi.runOnlyPendingTimers()

    expect(layoutElement.classes()).not.toContain('b-t-1')
    expect(layoutElement.classes()).not.toContain('b-t-border-primary')
    expect(layoutElement.classes()).not.toContain('b-t-solid')
    expect(wrapper.get('[data-layout-item="gutter-preview"]').classes()).not.toContain('markdown-edit-layout__gutter--preview-hidden')
  })

  it('纯预览布局且正文为空时显示空状态，点击“去编辑”会切回双栏', async () => {
    const wrapper = await mountMarkdownEdit({
      modelValue: '',
      previewPosition: 'right',
    })

    storeState.current.viewMode = 'preview'
    await flushLayoutRender()

    expect(wrapper.text()).toContain('editor.emptyDocument')
    expect(wrapper.text()).toContain('editor.goToEdit')

    await wrapper.get('button').trigger('click')

    expect(storeState.current.setViewMode).toHaveBeenCalledWith('split')
  })

  it('源码模式切到纯预览时，预览刷新完成后应把编辑器位置同步过去', async () => {
    await mountMarkdownEdit({ previewPosition: 'right' })

    storeState.current.viewMode = 'source'
    await flushLayoutRender()

    previewLayoutWiringState.syncEditorToPreview.mockClear()

    storeState.current.viewMode = 'preview'
    await flushLayoutRender()

    // 预览是从无到有挂载的，首轮同步必须等刷新完成后再执行。
    expect(previewLayoutWiringState.syncEditorToPreview).not.toHaveBeenCalled()

    getLastMarkdownPreviewStubInstance()?.emitRefreshComplete()
    await flushLayoutRender()

    expect(previewLayoutWiringState.syncEditorToPreview).toHaveBeenCalled()
  })

  it('previewPosition 从 right 切到 left 时，会重建 Split 并同步新的真实 DOM 顺序', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
    })

    expect(getLayoutSequence(wrapper)).toEqual([
      'editor',
      'gutter-preview',
      'preview',
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
      'preview',
      'gutter-preview',
      'editor',
    ])
    expect(splitState.calls.length).toBe(splitCallCountBeforeSwitch + 1)
    expect(activeSplitDestroySpy).toHaveBeenCalledWith(true)
    expect(splitState.calls.at(-1).columnGutters.map(item => item.element.dataset.layoutItem)).toEqual([
      'gutter-preview',
    ])
  })

  it('切换预览区显隐时，不应给布局容器注入宽度过渡样式', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
    })

    storeState.current.viewMode = 'source'
    await flushLayoutRender()

    expect(getLayoutStyle(wrapper)).not.toContain('transition:')
  })

  it('拖拽结束后会把编辑区与预览区像素列宽重新归一化成自适应 fr 轨道', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
    })

    const layoutElement = wrapper.get('[data-testid="markdown-edit-layout"]').element
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      if (element === layoutElement) {
        return {
          gridTemplateColumns: '600px 1px 300px',
        }
      }

      return {
        gridTemplateColumns: '',
      }
    })

    splitState.calls.at(-1)?.onDragEnd?.('column', 1)

    // 编辑区与预览区按彼此比例归一化，fr 之和必须保持为 1，否则会留出未分配的空白区域。
    expect(layoutElement.style.gridTemplateColumns).toBe('0.666667fr 1px 0.333333fr')

    getComputedStyleSpy.mockRestore()
  })

  it('重新打开预览后，应等待 refresh-complete 再执行首轮预览同步和高亮恢复', async () => {
    await mountMarkdownEdit({
      previewPosition: 'right',
    })

    previewLayoutWiringState.syncEditorToPreview.mockClear()
    previewLayoutWiringState.restorePreviewLinkedHighlight.mockClear()

    storeState.current.viewMode = 'source'
    await flushLayoutRender()

    previewLayoutWiringState.syncEditorToPreview.mockClear()
    previewLayoutWiringState.restorePreviewLinkedHighlight.mockClear()

    storeState.current.viewMode = 'split'
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
    })

    storeState.current.viewMode = 'source'
    await flushLayoutRender()

    previewLayoutWiringState.syncEditorToPreview.mockClear()
    previewLayoutWiringState.restorePreviewLinkedHighlight.mockClear()

    storeState.current.viewMode = 'split'
    await flushLayoutRender()
    const reopenedPreviewInstance = getLastMarkdownPreviewStubInstance()

    await wrapper.setProps({ previewPosition: 'left' })
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
    await mountMarkdownEdit({
      previewPosition: 'right',
    })

    const initialPreviewInstance = getLastMarkdownPreviewStubInstance()
    storeState.current.viewMode = 'source'
    await flushLayoutRender()

    previewLayoutWiringState.syncEditorToPreview.mockClear()
    previewLayoutWiringState.restorePreviewLinkedHighlight.mockClear()

    storeState.current.viewMode = 'split'
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

  it('恢复快照前会消费跨视图交接记录，并把同一行号写入编辑区与预览区锚点', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
    })

    viewScrollHandoff.publish({
      sessionId: 'session-1',
      revision: 3,
      lineNumber: 12,
      sourceAreaKey: 'preview-page',
    })

    await wrapper.vm.scheduleRestoreForCurrentSnapshot({
      sessionId: 'session-1',
      revision: 3,
    })

    const store = scrollAnchorSessionState.store
    expect(store['session-1']['editor-code']).toMatchObject({
      sessionId: 'session-1',
      scrollAreaKey: 'editor-code',
      revision: 3,
      anchor: {
        type: 'line-handoff',
        lineNumber: 12,
      },
      fallbackScrollTop: 0,
    })
    expect(store['session-1']['editor-preview']).toMatchObject({
      sessionId: 'session-1',
      scrollAreaKey: 'editor-preview',
      revision: 3,
      anchor: {
        type: 'line-handoff',
        lineNumber: 12,
      },
      fallbackScrollTop: 0,
    })
  })

  it('跨视图交接记录身份不匹配时，不应写入编辑区锚点缓存', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
    })

    viewScrollHandoff.publish({
      sessionId: 'session-1',
      revision: 2,
      lineNumber: 12,
    })

    await wrapper.vm.scheduleRestoreForCurrentSnapshot({
      sessionId: 'session-1',
      revision: 3,
    })

    expect(scrollAnchorSessionState.store['session-1']).toBeUndefined()
  })

  it('同一视图内切换文档时，有记录区域按 documentKey 恢复，无记录区域归零', async () => {
    const wrapper = await mountMarkdownEdit({
      previewPosition: 'right',
    })

    const editorController = viewScrollAnchorState.controllers.at(-2)
    const previewController = viewScrollAnchorState.controllers.at(-1)
    viewScrollAnchorState.restorableAreaKeys.add('D:/docs/a.md::editor-code')
    viewScrollAnchorState.restorableAreaKeys.add('D:/docs/a.md::editor-preview')

    const restoredResult = await wrapper.vm.handleDocumentContextSwitch({
      sessionId: 'session-a',
      revision: 0,
      resourceContext: { documentPath: 'D:/docs/a.md' },
    })

    expect(restoredResult).toEqual({
      editorCode: true,
      editorPreview: true,
    })
    expect(editorController.scheduleRestoreForCurrentSnapshot).toHaveBeenCalledWith({ mode: 'document' })
    expect(previewController.scheduleRestoreForCurrentSnapshot).toHaveBeenCalledWith({ mode: 'document' })
    expect(editorController.resetToTop).not.toHaveBeenCalled()
    expect(previewController.resetToTop).not.toHaveBeenCalled()
    // documentKeyGetter 必须已经把当前快照身份推进到新文档，
    // 这样两份控制器才能按 documentKey 而非临时 sessionId 读取缓存。
    expect(editorController.options.documentKeyGetter?.()).toBe('D:/docs/a.md')
    expect(previewController.options.documentKeyGetter?.()).toBe('D:/docs/a.md')

    const zeroedResult = await wrapper.vm.handleDocumentContextSwitch({
      sessionId: 'session-b',
      revision: 0,
      resourceContext: { documentPath: 'D:/docs/b.md' },
    })

    expect(zeroedResult).toEqual({
      editorCode: false,
      editorPreview: false,
    })
    expect(editorController.resetToTop).toHaveBeenCalledTimes(1)
    expect(previewController.resetToTop).toHaveBeenCalledTimes(1)
    expect(editorController.options.documentKeyGetter?.()).toBe('D:/docs/b.md')
    expect(previewController.options.documentKeyGetter?.()).toBe('D:/docs/b.md')
  })
})
