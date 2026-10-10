import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'

const markdownPreviewRuntimeState = vi.hoisted(() => ({
  store: null,
  renderedHtml: '<p>预览内容</p>',
  mermaidInitialize: vi.fn(),
  mermaidRun: vi.fn(async () => {}),
  mdSet: vi.fn(),
  mdRender: vi.fn(() => markdownPreviewRuntimeState.renderedHtml),
  syncCodeBlockActionVariables: vi.fn(),
  loadCodeTheme: vi.fn(async () => {}),
  handlePreviewHashAnchorClick: vi.fn(() => false),
  settleMermaidRender: vi.fn(async () => {}),
}))

const startupLoadingRuntimeState = vi.hoisted(() => ({
  firstScreenReady: false,
  STARTUP_LOADING_READY_EVENT: 'wj-first-screen-ready',
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: markdownPreviewRuntimeState.mermaidInitialize,
    run: markdownPreviewRuntimeState.mermaidRun,
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
  onBeforeRouteLeave: vi.fn(),
}))

vi.mock('ant-design-vue', () => ({
  message: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/components/editor/markdownPreviewDomPatchUtil.js', () => ({
  shouldReplaceElementBeforeAttributeSync() {
    return false
  },
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return markdownPreviewRuntimeState.store
  },
}))

vi.mock('@/util/codeBlockActionStyleUtil.js', () => ({
  syncCodeBlockActionVariables: markdownPreviewRuntimeState.syncCodeBlockActionVariables,
}))

vi.mock('@/util/codeThemeUtil.js', () => ({
  loadCodeTheme: markdownPreviewRuntimeState.loadCodeTheme,
}))

vi.mock('@/util/editor/previewAnchorLinkScrollUtil.js', () => ({
  handlePreviewHashAnchorClick: markdownPreviewRuntimeState.handlePreviewHashAnchorClick,
}))

vi.mock('@/util/markdown-it/markdownItDefault.js', () => ({
  default: {
    set: markdownPreviewRuntimeState.mdSet,
    render: markdownPreviewRuntimeState.mdRender,
  },
}))

vi.mock('@/util/previewInlineCodeCopyUtil.js', () => ({
  copyTextWithFeedback: vi.fn(async () => {}),
  getPreviewInlineCodeCopyText: vi.fn(() => null),
  syncPreviewInlineCodeCopyMetadata: vi.fn(),
}))

vi.mock('@/util/previewMermaidRenderUtil.js', () => ({
  settleMermaidRender: markdownPreviewRuntimeState.settleMermaidRender,
}))

// 首屏就绪状态由测试直接控制，便于验证延迟挂载语义。
vi.mock('@/util/startupLoadingUtil.js', () => ({
  STARTUP_LOADING_READY_EVENT: startupLoadingRuntimeState.STARTUP_LOADING_READY_EVENT,
  isFirstScreenReady: () => startupLoadingRuntimeState.firstScreenReady,
}))

const { default: MarkdownPreview } = await import('../MarkdownPreview.vue')

const WatermarkStub = defineComponent({
  name: 'AWatermarkStub',
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'watermark-stub' }, slots.default?.())
  },
})

const ImagePreviewGroupStub = defineComponent({
  name: 'AImagePreviewGroupStub',
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'image-preview-group-stub' }, slots.default?.())
  },
})

const ImageStub = defineComponent({
  name: 'AImageStub',
  props: {
    src: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    return () => h('img', {
      'data-testid': 'image-stub',
      'src': props.src,
    })
  },
})

function createStore() {
  return reactive({
    config: {
      theme: {
        global: 'light',
      },
      markdown: {
        inlineCodeClickCopy: false,
        imageShadow: true,
        typographer: false,
      },
    },
    externalFileChange: {
      visible: false,
    },
  })
}

async function flushRender() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

function mountMarkdownPreview(props = {}) {
  return mount(MarkdownPreview, {
    props: {
      content: '预览内容',
      codeTheme: 'atom-one-dark',
      previewTheme: 'github',
      ...props,
    },
    global: {
      stubs: {
        'a-watermark': WatermarkStub,
        'a-image-preview-group': ImagePreviewGroupStub,
        'a-image': ImageStub,
      },
    },
  })
}

describe('markdownPreview 水印延迟挂载', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    startupLoadingRuntimeState.firstScreenReady = false
    markdownPreviewRuntimeState.store = createStore()
  })

  afterEach(() => {
    markdownPreviewRuntimeState.store = null
    document.body.innerHTML = ''
  })

  it('水印未启用时，不渲染 a-watermark', async () => {
    const wrapper = mountMarkdownPreview({
      watermark: { enabled: false, content: 'wj-markdown-editor' },
    })

    await flushRender()

    expect(wrapper.find('[data-testid="watermark-stub"]').exists()).toBe(false)
    // 预览壳不能因为水印层不挂载而消失。
    expect(wrapper.find('.wj-preview-theme').exists()).toBe(true)

    wrapper.unmount()
  })

  it('水印启用且未要求延迟时，立即渲染 a-watermark', async () => {
    const wrapper = mountMarkdownPreview({
      watermark: { enabled: true, content: 'wj-markdown-editor' },
    })

    await flushRender()

    expect(wrapper.find('[data-testid="watermark-stub"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('水印启用且要求延迟时，在首屏就绪事件派发后才渲染 a-watermark', async () => {
    const wrapper = mountMarkdownPreview({
      watermark: { enabled: true, content: 'wj-markdown-editor' },
      deferWatermarkUntilReady: true,
    })

    await flushRender()

    expect(wrapper.find('[data-testid="watermark-stub"]').exists()).toBe(false)

    startupLoadingRuntimeState.firstScreenReady = true
    window.dispatchEvent(new CustomEvent(startupLoadingRuntimeState.STARTUP_LOADING_READY_EVENT))
    await nextTick()

    expect(wrapper.find('[data-testid="watermark-stub"]').exists()).toBe(true)

    wrapper.unmount()
  })
})
