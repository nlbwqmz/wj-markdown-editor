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

  return {
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
  latestInitOptions: null,
  initEditor: vi.fn(),
  destroyEditor: vi.fn(),
  reconfigureTheme: vi.fn(),
  reconfigureExtensions: vi.fn(),
  reconfigureKeymap: vi.fn(),
}))

const associationHighlightState = vi.hoisted(() => ({
  highlightByEditorCursor: vi.fn(),
}))

const debounceState = vi.hoisted(() => ({
  pending: false,
  callback: null,
  cancel: vi.fn(),
  flush: vi.fn(),
  runPending: vi.fn(),
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
      isCompositionActive: () => false,
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
    debounceState.callback = callback
    debounceState.pending = false
    debounceState.cancel.mockImplementation(() => {
      debounceState.pending = false
    })
    debounceState.flush.mockImplementation(() => {
      if (debounceState.pending !== true || typeof debounceState.callback !== 'function') {
        return false
      }
      debounceState.pending = false
      debounceState.callback()
      return true
    })
    debounceState.runPending.mockImplementation(() => {
      if (debounceState.pending !== true || typeof debounceState.callback !== 'function') {
        return false
      }
      debounceState.pending = false
      debounceState.callback()
      return true
    })

    return {
      schedule: vi.fn(() => {
        debounceState.pending = true
      }),
      flush: debounceState.flush,
      hasPending: vi.fn(() => debounceState.pending === true),
      cancel: debounceState.cancel,
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

const KeepAliveHost = defineComponent({
  name: 'MarkdownEditKeepAliveDebounceHost',
  props: {
    active: {
      type: Boolean,
      default: true,
    },
  },
  setup(props) {
    return () => h(KeepAlive, null, {
      default: () => h(
        props.active === true ? MarkdownEdit : createStubComponent('InactivePlaceholder'),
        props.active === true
          ? {
              'modelValue': '# start',
              'onUpdate:modelValue': () => {},
            }
          : {},
      ),
    })
  },
})

describe('markdownEdit keep-alive 失活时的正文 debounce', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const fakeView = createFakeEditorView('# start')
    storeState.current = createStore()
    editorCoreState.editorViewRef.value = fakeView
    editorCoreState.latestInitOptions = null
    editorCoreState.initEditor.mockImplementation((options) => {
      editorCoreState.latestInitOptions = options
      editorCoreState.editorViewRef.value = fakeView
    })
    debounceState.pending = false
    debounceState.callback = null
    associationHighlightState.highlightByEditorCursor.mockReset()
  })

  afterEach(() => {
    storeState.current = null
  })

  it('进入 keep-alive 失活前若仍有挂起 debounce，应取消而不是在隐藏状态补发高亮事务', async () => {
    const wrapper = mount(KeepAliveHost, {
      props: {
        active: true,
      },
    })

    await flushRender()

    editorCoreState.latestInitOptions?.onDocChange?.()
    expect(debounceState.pending).toBe(true)
    expect(associationHighlightState.highlightByEditorCursor).not.toHaveBeenCalled()

    await wrapper.setProps({
      active: false,
    })
    await flushRender()

    expect(debounceState.cancel).toHaveBeenCalledTimes(1)
    expect(debounceState.pending).toBe(false)

    debounceState.runPending()

    expect(associationHighlightState.highlightByEditorCursor).not.toHaveBeenCalled()
  })
})
