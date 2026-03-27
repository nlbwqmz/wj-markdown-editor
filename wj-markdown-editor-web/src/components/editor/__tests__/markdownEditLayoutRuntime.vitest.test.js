import { shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

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
  default: createStubComponent('MarkdownPreviewStub'),
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
      rebuildPreviewLayoutIndex: vi.fn(() => 0),
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
        highlightByEditorCursor: vi.fn(),
        onPreviewAreaClick: vi.fn(),
        restorePreviewLinkedHighlight: vi.fn(),
      },
    }
  },
}))

vi.mock('@/components/editor/previewRefreshCoordinator.js', () => ({
  createPreviewRefreshCoordinator() {
    return {
      onRefreshComplete: vi.fn(),
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

  const wrapper = shallowMount(MarkdownEdit, {
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

describe('markdownEdit 布局运行时接线', () => {
  beforeEach(() => {
    splitState.calls.length = 0
    splitState.destroySpies.length = 0
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
})
