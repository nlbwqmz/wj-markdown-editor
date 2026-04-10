import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
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
    dispatch: vi.fn(),
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

const selectionUpdateState = vi.hoisted(() => ({
  pointerSelection: false,
}))

const associationHighlightState = vi.hoisted(() => ({
  highlightByEditorCursor: vi.fn(),
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
    return selectionUpdateState.pointerSelection === true
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
} = {}) {
  const fakeView = createFakeEditorView(modelValue)
  editorCoreState.editorViewRef.value = fakeView
  editorCoreState.latestInitOptions = null
  editorCoreState.initEditor.mockImplementation((options) => {
    editorCoreState.latestInitOptions = options
  })
  storeState.current = createStore()

  const wrapper = mount(MarkdownEdit, {
    props: {
      modelValue,
    },
  })

  await flushRender()

  return {
    wrapper,
    fakeView,
  }
}

describe('markdownEdit 输入期关联高亮调度', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.current = null
    editorCoreState.domCompositionActive = false
    selectionUpdateState.pointerSelection = false
    associationHighlightState.highlightByEditorCursor.mockClear()
  })

  afterEach(() => {
    storeState.current = null
    editorCoreState.domCompositionActive = false
    selectionUpdateState.pointerSelection = false
  })

  it('普通输入导致的 selectionSet + docChanged 只应刷新预览侧高亮', async () => {
    await mountMarkdownEdit()

    const selectionState = {
      doc: {
        lineAt() {
          return {
            number: 3,
          }
        },
      },
      selection: {
        main: {
          to: 8,
        },
      },
    }

    editorCoreState.latestInitOptions?.onSelectionChange?.({
      selectionSet: true,
      docChanged: true,
      state: selectionState,
      transactions: [],
    })

    expect(associationHighlightState.highlightByEditorCursor).toHaveBeenCalledTimes(1)
    expect(associationHighlightState.highlightByEditorCursor).toHaveBeenCalledWith(selectionState, {
      previewOnly: true,
    })
  })

  it('组合输入窗口仍处于活跃状态时，不应触发关联高亮二次事务', async () => {
    const { fakeView } = await mountMarkdownEdit()

    fakeView.composing = true

    editorCoreState.latestInitOptions?.onSelectionChange?.({
      selectionSet: true,
      docChanged: false,
      state: {
        doc: {
          lineAt() {
            return {
              number: 4,
            }
          },
        },
        selection: {
          main: {
            to: 12,
          },
        },
      },
      transactions: [],
    })

    expect(associationHighlightState.highlightByEditorCursor).not.toHaveBeenCalled()
  })

  it('compositionstart 到 CodeMirror 状态翻转前的 fallback 空窗，也不应触发关联高亮事务', async () => {
    const { fakeView } = await mountMarkdownEdit()

    editorCoreState.domCompositionActive = true

    editorCoreState.latestInitOptions?.onSelectionChange?.({
      selectionSet: true,
      docChanged: false,
      state: {
        doc: {
          lineAt() {
            return {
              number: 4,
            }
          },
        },
        selection: {
          main: {
            to: 12,
          },
        },
      },
      transactions: [],
    })

    expect(associationHighlightState.highlightByEditorCursor).not.toHaveBeenCalled()

    editorCoreState.latestInitOptions?.onClick?.(fakeView)

    expect(associationHighlightState.highlightByEditorCursor).not.toHaveBeenCalled()
  })

  it('纯选区移动仍应维持关联高亮更新', async () => {
    await mountMarkdownEdit()

    const selectionState = {
      doc: {
        lineAt() {
          return {
            number: 5,
          }
        },
      },
      selection: {
        main: {
          to: 16,
        },
      },
    }

    editorCoreState.latestInitOptions?.onSelectionChange?.({
      selectionSet: true,
      docChanged: false,
      state: selectionState,
      transactions: [],
    })

    expect(associationHighlightState.highlightByEditorCursor).toHaveBeenCalledTimes(1)
    expect(associationHighlightState.highlightByEditorCursor).toHaveBeenCalledWith(selectionState)
  })
})
