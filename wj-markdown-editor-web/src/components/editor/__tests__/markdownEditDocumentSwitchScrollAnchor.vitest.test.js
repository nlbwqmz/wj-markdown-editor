import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import MarkdownEdit from '../MarkdownEdit.vue'

/**
 * 创建最小可用的 Vue ref 桩对象。
 * useEditorCore 在测试中被替换为这个桩，便于直接控制编辑器滚动容器。
 *
 * @param {unknown} value
 * @returns {{ __v_isRef: boolean, value: unknown }} 返回可读写的 ref 桩。
 */
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

const editorCoreState = vi.hoisted(() => ({
  editorView: null,
}))

const previewLayoutWiringState = vi.hoisted(() => ({
  rebuildPreviewLayoutIndex: vi.fn(() => 0),
  jumpToTargetLine: vi.fn(),
  jumpEditorToLine: vi.fn(),
  suppressNextPreviewToEditorSync: vi.fn(),
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

const storeState = vi.hoisted(() => ({
  current: null,
}))

// 记录滚动锚点缓存读写实际使用的 bucket 键，
// 用于断言采集侧与恢复侧跨层传递后仍落在同一个 documentKey 上。
const scrollAnchorBucketState = vi.hoisted(() => ({
  savedCalls: [],
  readCalls: [],
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
    setup(_props, { attrs, slots }) {
      return () => h('div', attrs, slots.default ? slots.default() : [])
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
    setup(_props, { attrs }) {
      return () => h('div', attrs)
    },
  }),
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return storeState.current
  },
}))

/**
 * 在保留真实缓存实现的前提下记录读写使用的 bucket 键。
 * 这里只做旁路观测，不改变 saveAnchorRecord / getAnchorRecord 的任何行为，
 * 从而让「采集写入」与「切回查询」两侧的 documentKey 能在同一条断言里比较。
 */
vi.mock('@/util/editor/viewScrollAnchorSessionUtil.js', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    saveAnchorRecord(store, record) {
      const savedRecord = actual.saveAnchorRecord(store, record)

      if (savedRecord != null) {
        scrollAnchorBucketState.savedCalls.push({
          documentKey: savedRecord.documentKey,
          scrollAreaKey: savedRecord.scrollAreaKey,
        })
      }

      return savedRecord
    },
    getAnchorRecord(store, options) {
      const record = actual.getAnchorRecord(store, options)

      scrollAnchorBucketState.readCalls.push({
        documentKey: options?.documentKey ?? '',
        scrollAreaKey: options?.scrollAreaKey ?? '',
        hit: record != null,
      })

      return record
    },
  }
})

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
      editorView: editorCoreState.editorView,
      isCompositionActive: () => false,
      initEditor: vi.fn(),
      destroyEditor: vi.fn(),
      reconfigureTheme: vi.fn(),
      reconfigureExtensions: vi.fn(),
      reconfigureKeymap: vi.fn(),
    }
  },
}))

/**
 * 保留真实的 useViewScrollAnchor 实现，只把与几何计算相关的依赖替换成可观察桩：
 * 1. 锚点采集直接记录当前 scrollTop
 * 2. 锚点恢复直接写回记录里的 fallbackScrollTop
 * 3. 布局等待退化成一次 nextTick，让测试聚焦文档身份切换语义
 * 这样缓存 bucket、document 模式恢复资格与 resetToTop 都仍然走真实实现。
 */
vi.mock('@/components/editor/composables/useViewScrollAnchor.js', async (importOriginal) => {
  const actual = await importOriginal()
  const { nextTick: flushTick } = await import('vue')

  return {
    ...actual,
    useViewScrollAnchor(options = {}) {
      return actual.useViewScrollAnchor({
        ...options,
        waitLayoutStable: async () => {
          await flushTick()
        },
        captureAnchor: ({ scrollElement }) => ({
          type: 'test-scroll-anchor',
          scrollTop: Number.isFinite(scrollElement?.scrollTop) ? scrollElement.scrollTop : 0,
        }),
        restoreAnchor: ({ record, scrollElement }) => {
          if (!scrollElement) {
            return false
          }

          scrollElement.scrollTop = Number.isFinite(record?.fallbackScrollTop) ? record.fallbackScrollTop : 0
          return true
        },
      })
    },
  }
})

vi.mock('@/components/editor/markdownEditPreviewLayoutIndexWiring.js', () => ({
  createMarkdownEditPreviewLayoutIndexWiring() {
    return {
      rebuildPreviewLayoutIndex: previewLayoutWiringState.rebuildPreviewLayoutIndex,
      previewSync: {
        jumpToTargetLine: previewLayoutWiringState.jumpToTargetLine,
        jumpEditorToLine: previewLayoutWiringState.jumpEditorToLine,
        suppressNextPreviewToEditorSync: previewLayoutWiringState.suppressNextPreviewToEditorSync,
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

function createStore({ menuVisible = false } = {}) {
  return {
    config: {
      menuVisible,
      menuWidth: 300,
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

async function mountMarkdownEdit({ previewPosition = 'right', menuVisible = false } = {}) {
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

describe('markdownEdit 文档切换滚动锚点', () => {
  beforeEach(() => {
    splitState.calls.length = 0
    splitState.destroySpies.length = 0
    scrollAnchorBucketState.savedCalls.length = 0
    scrollAnchorBucketState.readCalls.length = 0
    editorCoreState.editorView = createFakeRef(null)
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
  })

  afterEach(() => {
    storeState.current = null
    editorCoreState.editorView = null
  })

  it('切换到无记录的文档时，编辑区与可见预览区都会归零', async () => {
    const wrapper = await mountMarkdownEdit()
    const editorScrollElement = { scrollTop: 320 }
    editorCoreState.editorView.value = { scrollDOM: editorScrollElement }
    const previewElement = wrapper.get('[data-layout-item="preview"]').element
    previewElement.scrollTop = 480

    const result = await wrapper.vm.handleDocumentContextSwitch({
      sessionId: 'session-b',
      revision: 0,
      resourceContext: { documentPath: 'D:/docs/b.md' },
    })

    expect(result).toEqual({
      editorCode: false,
      editorPreview: false,
    })
    expect(editorScrollElement.scrollTop).toBe(0)
    expect(previewElement.scrollTop).toBe(0)
  })

  it('切回有记录的文档时，编辑区与预览区会按 documentKey 恢复', async () => {
    const wrapper = await mountMarkdownEdit()
    const editorScrollElement = { scrollTop: 0 }
    editorCoreState.editorView.value = { scrollDOM: editorScrollElement }
    const previewElement = wrapper.get('[data-layout-item="preview"]').element

    // 文档 A：采集一份属于自己的阅读位置。
    editorScrollElement.scrollTop = 260
    previewElement.scrollTop = 420
    wrapper.vm.captureViewScrollAnchors({
      sessionId: 'session-a',
      revision: 2,
      resourceContext: { documentPath: 'D:/docs/a.md' },
    })

    // 先切到无记录的 B：两个区域都必须归零，不沿用 A 的位置。
    editorScrollElement.scrollTop = 900
    previewElement.scrollTop = 900
    await wrapper.vm.handleDocumentContextSwitch({
      sessionId: 'session-b',
      revision: 0,
      resourceContext: { documentPath: 'D:/docs/b.md' },
    })
    expect(editorScrollElement.scrollTop).toBe(0)
    expect(previewElement.scrollTop).toBe(0)

    // 再切回 A：新 sessionId / revision 从 0 开始，仍应按 documentKey 恢复。
    const result = await wrapper.vm.handleDocumentContextSwitch({
      sessionId: 'session-a-next',
      revision: 0,
      resourceContext: { documentPath: 'D:/docs/a.md' },
    })

    expect(result).toEqual({
      editorCode: true,
      editorPreview: true,
    })
    expect(editorScrollElement.scrollTop).toBe(260)
    expect(previewElement.scrollTop).toBe(420)
  })

  it('预览区不可见时不触发预览区归零，也不会抛错', async () => {
    const wrapper = await mountMarkdownEdit()
    const editorScrollElement = { scrollTop: 150 }
    editorCoreState.editorView.value = { scrollDOM: editorScrollElement }

    wrapper.vm.$.setupState.previewVisible = false
    await flushLayoutRender()
    expect(wrapper.find('[data-layout-item="preview"]').exists()).toBe(false)

    const result = await wrapper.vm.handleDocumentContextSwitch({
      sessionId: 'session-b',
      revision: 0,
      resourceContext: { documentPath: 'D:/docs/b.md' },
    })

    expect(result).toEqual({
      editorCode: false,
      editorPreview: false,
    })
    expect(editorScrollElement.scrollTop).toBe(0)
  })

  it('同会话内容更新不会触发滚动归零', async () => {
    const wrapper = await mountMarkdownEdit()
    const editorScrollElement = { scrollTop: 0 }
    editorCoreState.editorView.value = { scrollDOM: editorScrollElement }
    const previewElement = wrapper.get('[data-layout-item="preview"]').element

    editorScrollElement.scrollTop = 200
    previewElement.scrollTop = 300
    wrapper.vm.captureViewScrollAnchors({
      sessionId: 'session-a',
      revision: 2,
      resourceContext: { documentPath: 'D:/docs/a.md' },
    })

    // 同文档内容更新：documentKey 不变，revision 推进；
    // 走普通恢复路径时即使未命中严格同会话记录，也不允许把位置归零。
    editorScrollElement.scrollTop = 210
    previewElement.scrollTop = 310
    const result = await wrapper.vm.scheduleRestoreForCurrentSnapshot({
      sessionId: 'session-a',
      revision: 3,
      resourceContext: { documentPath: 'D:/docs/a.md' },
    })

    expect(result).toEqual({
      editorCode: false,
      editorPreview: false,
    })
    expect(editorScrollElement.scrollTop).toBe(210)
    expect(previewElement.scrollTop).toBe(310)
  })

  it('草稿保存获得真实路径后（sessionId 未变），同会话恢复不应归零或移动滚动位置', async () => {
    const wrapper = await mountMarkdownEdit()
    const editorScrollElement = { scrollTop: 0 }
    editorCoreState.editorView.value = { scrollDOM: editorScrollElement }
    const previewElement = wrapper.get('[data-layout-item="preview"]').element

    // 草稿阶段：documentKey 为 session:session-draft
    editorScrollElement.scrollTop = 260
    previewElement.scrollTop = 420
    wrapper.vm.captureViewScrollAnchors({
      sessionId: 'session-draft',
      revision: 1,
      resourceContext: { documentPath: null },
    })

    // 用户继续滚动
    editorScrollElement.scrollTop = 180
    previewElement.scrollTop = 300

    // 保存草稿：sessionId 不变，documentKey 变为真实路径，revision 推进；
    // 同会话恢复路径不得归零，也不得把草稿阶段的旧位置写回。
    const result = await wrapper.vm.scheduleRestoreForCurrentSnapshot({
      sessionId: 'session-draft',
      revision: 2,
      resourceContext: { documentPath: 'D:/docs/a.md' },
    })

    expect(result).toEqual({
      editorCode: false,
      editorPreview: false,
    })
    expect(editorScrollElement.scrollTop).toBe(180)
    expect(previewElement.scrollTop).toBe(300)
  })

  it('跨层一致性：采集与切回命中同一真实路径 bucket，并恢复采集位置', async () => {
    const wrapper = await mountMarkdownEdit()
    const editorScrollElement = { scrollTop: 0 }
    editorCoreState.editorView.value = { scrollDOM: editorScrollElement }
    const previewElement = wrapper.get('[data-layout-item="preview"]').element

    // 采集侧：完整 snapshot（含 resourceContext.documentPath）直接进入采集入口，
    // 与 EditorView 当前窗口切换前准备 / 路由离开两条路径保持一致。
    editorScrollElement.scrollTop = 260
    previewElement.scrollTop = 420
    wrapper.vm.captureViewScrollAnchors({
      sessionId: 'session-a',
      revision: 2,
      resourceContext: { documentPath: 'D:/docs/a.md' },
    })

    // 先切到无记录的 B，再切回 A：新 sessionId / revision 都从 0 开始。
    await wrapper.vm.handleDocumentContextSwitch({
      sessionId: 'session-b',
      revision: 0,
      resourceContext: { documentPath: 'D:/docs/b.md' },
    })
    const restoredResult = await wrapper.vm.handleDocumentContextSwitch({
      sessionId: 'session-a-next',
      revision: 0,
      resourceContext: { documentPath: 'D:/docs/a.md' },
    })

    const savedBucketKeys = [...new Set(scrollAnchorBucketState.savedCalls.map(call => call.documentKey))]
    const hitBucketKeys = [...new Set(
      scrollAnchorBucketState.readCalls
        .filter(call => call.hit === true)
        .map(call => call.documentKey),
    )]

    // 采集写入的 bucket 键 === 切回时查询命中的 bucket 键 === 真实路径。
    expect(savedBucketKeys).toEqual(['D:/docs/a.md'])
    expect(hitBucketKeys).toEqual(['D:/docs/a.md'])
    expect(savedBucketKeys[0]).toBe(hitBucketKeys[0])
    // 恢复侧不允许再出现退化的 session:xxx 查询。
    expect(scrollAnchorBucketState.readCalls.some(call => call.documentKey.startsWith('session:'))).toBe(false)

    expect(restoredResult).toEqual({
      editorCode: true,
      editorPreview: true,
    })
    expect(editorScrollElement.scrollTop).toBe(260)
    expect(previewElement.scrollTop).toBe(420)

    // 防御性回归：即使上游把已解析 identity 再次传入采集入口，
    // 也必须继续写入同一真实路径 bucket，不能退化成 session:xxx。
    scrollAnchorBucketState.savedCalls.length = 0
    wrapper.vm.captureViewScrollAnchors({
      documentKey: 'D:/docs/a.md',
      sessionId: 'session-a-next',
      revision: 0,
    })

    expect([...new Set(scrollAnchorBucketState.savedCalls.map(call => call.documentKey))]).toEqual(['D:/docs/a.md'])
  })
})
