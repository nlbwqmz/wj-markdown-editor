import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick } from 'vue'
import MarkdownEdit from '../MarkdownEdit.vue'

function createFakeRef(value) {
  return {
    __v_isRef: true,
    value,
  }
}

function createFakeEditorView(initialContent = '# start') {
  const docState = {
    text: initialContent,
    toString() {
      return this.text
    },
  }

  const view = {
    composing: false,
    compositionStarted: false,
    scrollDOM: {
      scrollTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      scrollTo: vi.fn(),
    },
    state: {
      doc: docState,
      selection: {
        main: {
          from: 0,
          to: 0,
        },
      },
    },
    dispatch: vi.fn((transaction) => {
      if (transaction?.changes) {
        docState.text = transaction.changes.insert
      }
      if (transaction?.selection) {
        view.state.selection.main = {
          from: transaction.selection.anchor,
          to: transaction.selection.head,
        }
      }
    }),
    focus: vi.fn(),
  }

  return view
}

function createStubComponent(name) {
  return defineComponent({
    name,
    setup(_props, { attrs, slots }) {
      return () => h('div', attrs, slots.default ? slots.default() : [])
    },
  })
}

const storeState = vi.hoisted(() => ({
  current: null,
}))

const editorCoreState = vi.hoisted(() => ({
  editorViewRef: createFakeRef(null),
  domCompositionActive: false,
  initEditor: vi.fn(),
  destroyEditor: vi.fn(),
  reconfigureTheme: vi.fn(),
  reconfigureExtensions: vi.fn(),
  reconfigureKeymap: vi.fn(),
  latestInitOptions: null,
  isCompositionActive() {
    const view = editorCoreState.editorViewRef.value
    return editorCoreState.domCompositionActive === true
      || view?.composing === true
      || view?.compositionStarted === true
  },
}))

const associationHighlightState = vi.hoisted(() => ({
  highlightByEditorCursor: vi.fn(),
}))

const LONG_TABLE_TAIL_SAMPLE = `
## 邮箱

|           邮箱           |    密码    | 标记A | 标记B |
| :----------------------: | :--------: | :---: | :---: |
|   account01@example.com  | Pass123456 |  是   |  否   |
|   account02@example.com  | Pass123456 |  是   |  否   |
|   account03@example.com  | Pass123456 |  是   |  否   |
|   account04@example.com  | Pass123456 |  是   |  否   |
|   account05@example.com  | Pass123456 |  是   |  是   |
|   account06@example.com  | Pass123456 |  是   |  是   |
|   account07@example.com  | Pass123456 |  是   |  是   |
|   account08@example.com  | Pass123456 |  是   |  是   |
`.trim()

vi.mock('vue-i18n', () => ({
  useI18n() {
    return {
      t(key) {
        return key
      },
    }
  },
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return storeState.current
  },
}))

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
  default: createStubComponent('MarkdownPreviewStub'),
}))

vi.mock('split-grid', () => ({
  default() {
    return {
      destroy: vi.fn(),
    }
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
      editorView: editorCoreState.editorViewRef,
      isCompositionActive: editorCoreState.isCompositionActive,
      initEditor: editorCoreState.initEditor,
      destroyEditor: editorCoreState.destroyEditor,
      reconfigureTheme: editorCoreState.reconfigureTheme,
      reconfigureExtensions: editorCoreState.reconfigureExtensions,
      reconfigureKeymap: editorCoreState.reconfigureKeymap,
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
      rebuildPreviewLayoutIndex: vi.fn(),
      previewSync: {
        jumpToTargetLine: vi.fn(),
        syncEditorToPreview: vi.fn(),
        syncPreviewToEditor: vi.fn(),
        bindEvents: vi.fn(),
        unbindEvents: vi.fn(),
        clearScrollTimer: vi.fn(),
      },
      associationHighlight: {
        linkedSourceHighlightField: {},
        linkedHighlightThemeStyle: createFakeRef({}),
        cancelScheduledCursorHighlight: vi.fn(),
        clearAllLinkedHighlight: vi.fn(),
        clearLinkedHighlightDisplay: vi.fn(),
        highlightByEditorCursor: associationHighlightState.highlightByEditorCursor,
        onPreviewAreaClick: vi.fn(),
        restorePreviewLinkedHighlight: vi.fn(),
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

function createStore() {
  return {
    config: {
      menuVisible: false,
      shortcutKeyList: [],
      theme: {
        global: 'light',
      },
    },
    editorSearchBarVisible: false,
    searchBarVisible: false,
  }
}

async function flushRender() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function mountMarkdownEdit({
  modelValue = '# start',
  contentUpdateMeta,
  startWithView = true,
} = {}) {
  const fakeView = createFakeEditorView(modelValue)
  editorCoreState.editorViewRef.value = startWithView === true ? fakeView : null
  editorCoreState.latestInitOptions = null
  editorCoreState.initEditor.mockImplementation((options) => {
    editorCoreState.latestInitOptions = options
    editorCoreState.editorViewRef.value = fakeView
  })
  storeState.current = createStore()

  const wrapper = mount(MarkdownEdit, {
    props: {
      modelValue,
      contentUpdateMeta,
    },
  })

  await flushRender()
  return {
    wrapper,
    fakeView,
  }
}

const KeepAliveHost = defineComponent({
  name: 'MarkdownEditKeepAliveHost',
  props: {
    active: {
      type: Boolean,
      default: true,
    },
    modelValue: {
      type: String,
      default: '# start',
    },
    contentUpdateMeta: {
      type: Object,
      default: () => ({
        token: 0,
        cursorPosition: null,
        focus: false,
        scrollIntoView: false,
      }),
    },
  },
  setup(props) {
    return () => h(KeepAlive, null, {
      default: () => h(
        props.active === true ? MarkdownEdit : createStubComponent('InactivePlaceholder'),
        props.active === true
          ? {
              'modelValue': props.modelValue,
              'contentUpdateMeta': props.contentUpdateMeta,
              'onUpdate:modelValue': () => {},
            }
          : {},
      ),
    })
  },
})

describe('markdownEdit 组合输入外部同步', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.current = null
    editorCoreState.domCompositionActive = false
    associationHighlightState.highlightByEditorCursor.mockReset()
  })

  afterEach(() => {
    storeState.current = null
    editorCoreState.domCompositionActive = false
  })

  it('compositionstart 空窗仅靠 DOM fallback 仍活跃时，也必须挂起外部正文回放', async () => {
    const { wrapper, fakeView } = await mountMarkdownEdit({
      modelValue: '# start',
    })

    editorCoreState.domCompositionActive = true
    fakeView.composing = false
    fakeView.compositionStarted = false

    await wrapper.setProps({
      modelValue: '# fallback-window',
    })
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(0)

    editorCoreState.domCompositionActive = false
    editorCoreState.latestInitOptions?.onCompositionIdle?.()
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(1)
    expect(fakeView.dispatch.mock.calls[0][0]).toMatchObject({
      changes: {
        from: 0,
        to: '# start'.length,
        insert: '# fallback-window',
      },
    })
  })

  it('组合输入期间不应立即回放外部正文，并在结束后只应用最新快照', async () => {
    const { wrapper, fakeView } = await mountMarkdownEdit({
      modelValue: '# start',
    })

    fakeView.composing = true
    fakeView.compositionStarted = true

    await wrapper.setProps({
      modelValue: '# one',
    })
    await flushRender()

    await wrapper.setProps({
      modelValue: '# two',
    })
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(0)

    fakeView.composing = false
    fakeView.compositionStarted = false
    editorCoreState.latestInitOptions?.onCompositionIdle?.()
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(1)
    expect(fakeView.dispatch.mock.calls[0][0]).toMatchObject({
      changes: {
        from: 0,
        to: '# start'.length,
        insert: '# two',
      },
    })
  })

  it('组合输入期间不应立即回放 selection-only 外部事务', async () => {
    const { wrapper, fakeView } = await mountMarkdownEdit({
      modelValue: '# start',
    })

    fakeView.composing = true
    fakeView.compositionStarted = true

    await wrapper.setProps({
      contentUpdateMeta: {
        token: 1,
        cursorPosition: 3,
        focus: true,
        scrollIntoView: true,
      },
    })
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(0)

    fakeView.composing = false
    fakeView.compositionStarted = false
    editorCoreState.latestInitOptions?.onCompositionIdle?.()
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(1)
    expect(fakeView.dispatch.mock.calls[0][0]).toMatchObject({
      selection: {
        anchor: 3,
        head: 3,
      },
      scrollIntoView: true,
    })
    expect(fakeView.focus).toHaveBeenCalled()
  })

  it('带显式选区恢复意图的 contentUpdateMeta 在初次挂载后也必须补应用', async () => {
    const { fakeView } = await mountMarkdownEdit({
      modelValue: '# start',
      startWithView: false,
      contentUpdateMeta: {
        token: 1,
        cursorPosition: 4,
        focus: true,
        scrollIntoView: true,
      },
    })

    expect(fakeView.dispatch).toHaveBeenCalledTimes(1)
    expect(fakeView.dispatch.mock.calls[0][0]).toMatchObject({
      selection: {
        anchor: 4,
        head: 4,
      },
      scrollIntoView: true,
    })
    expect(fakeView.focus).toHaveBeenCalledTimes(1)
  })

  it('组合输入期间挂起的显式选区恢复，在 keep-alive 失活再激活后也不能丢失', async () => {
    const fakeView = createFakeEditorView('# start')
    editorCoreState.editorViewRef.value = fakeView
    editorCoreState.latestInitOptions = null
    editorCoreState.initEditor.mockImplementation((options) => {
      editorCoreState.latestInitOptions = options
    })
    storeState.current = createStore()

    const wrapper = mount(KeepAliveHost, {
      props: {
        active: true,
        modelValue: '# start',
        contentUpdateMeta: {
          token: 0,
          cursorPosition: null,
          focus: false,
          scrollIntoView: false,
        },
      },
    })

    await flushRender()

    fakeView.composing = true
    fakeView.compositionStarted = true

    await wrapper.setProps({
      contentUpdateMeta: {
        token: 2,
        cursorPosition: 5,
        focus: true,
        scrollIntoView: true,
      },
    })
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(0)

    await wrapper.setProps({
      active: false,
    })
    await flushRender()

    fakeView.composing = false
    fakeView.compositionStarted = false

    await wrapper.setProps({
      active: true,
    })
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(1)
    expect(fakeView.dispatch.mock.calls[0][0]).toMatchObject({
      selection: {
        anchor: 5,
        head: 5,
      },
      scrollIntoView: true,
    })
    expect(fakeView.focus).toHaveBeenCalledTimes(1)
  })

  it('长表格尾部在组合输入期间应挂起正文与选区回放，待稳定后一次性应用最新快照', async () => {
    const { wrapper, fakeView } = await mountMarkdownEdit({
      modelValue: LONG_TABLE_TAIL_SAMPLE,
    })

    const nextContent = `${LONG_TABLE_TAIL_SAMPLE}\n|   account09@example.com  | Pass123456 |  是   |  是   |`
    const nextCursorPosition = nextContent.length

    fakeView.composing = true
    fakeView.compositionStarted = true

    await wrapper.setProps({
      modelValue: nextContent,
      contentUpdateMeta: {
        token: 1,
        cursorPosition: nextCursorPosition,
        focus: true,
        scrollIntoView: true,
      },
    })
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(0)

    fakeView.composing = false
    fakeView.compositionStarted = false
    editorCoreState.latestInitOptions?.onCompositionIdle?.()
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(1)
    expect(fakeView.dispatch.mock.calls[0][0]).toMatchObject({
      changes: {
        from: 0,
        to: LONG_TABLE_TAIL_SAMPLE.length,
        insert: nextContent,
      },
      selection: {
        anchor: nextCursorPosition,
        head: nextCursorPosition,
      },
      scrollIntoView: true,
    })
    expect(fakeView.focus).toHaveBeenCalled()
  })

  it('组合输入结束后若父层已先回放新快照，延后冲刷不得再把旧挂起 payload 回滚回来', async () => {
    const { wrapper, fakeView } = await mountMarkdownEdit({
      modelValue: '# start',
    })

    fakeView.composing = true
    fakeView.compositionStarted = true

    await wrapper.setProps({
      modelValue: '# pending',
    })
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(0)

    fakeView.composing = false
    fakeView.compositionStarted = false

    await wrapper.setProps({
      modelValue: '# latest',
    })
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(1)
    expect(fakeView.dispatch.mock.calls[0][0]).toMatchObject({
      changes: {
        from: 0,
        to: '# start'.length,
        insert: '# latest',
      },
    })

    editorCoreState.latestInitOptions?.onCompositionIdle?.()
    await flushRender()

    expect(fakeView.dispatch).toHaveBeenCalledTimes(1)
    expect(fakeView.state.doc.toString()).toBe('# latest')
  })

  it('输入稳定后触发正文上浮时，应补做一次当前光标关联高亮刷新', async () => {
    const { fakeView } = await mountMarkdownEdit({
      modelValue: '# start',
    })
    associationHighlightState.highlightByEditorCursor.mockClear()

    editorCoreState.latestInitOptions?.onDocChange?.()

    expect(associationHighlightState.highlightByEditorCursor).toHaveBeenCalledTimes(1)
    expect(associationHighlightState.highlightByEditorCursor).toHaveBeenCalledWith(fakeView.state)
  })

  it('普通输入导致的 docChanged 选区更新，只应刷新预览侧高亮，避免再次向编辑器发装饰事务', async () => {
    await mountMarkdownEdit({
      modelValue: '# start',
    })
    associationHighlightState.highlightByEditorCursor.mockClear()

    const selectionState = {
      doc: {
        lineAt() {
          return {
            number: 2,
          }
        },
      },
      selection: {
        main: {
          to: 0,
        },
      },
    }

    editorCoreState.latestInitOptions?.onSelectionChange?.({
      docChanged: true,
      selectionSet: true,
      state: selectionState,
      transactions: [],
    })

    expect(associationHighlightState.highlightByEditorCursor).toHaveBeenCalledTimes(1)
    expect(associationHighlightState.highlightByEditorCursor).toHaveBeenCalledWith(selectionState, {
      previewOnly: true,
    })
  })
})
