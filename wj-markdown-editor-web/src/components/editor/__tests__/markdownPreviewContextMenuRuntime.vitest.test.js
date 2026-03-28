import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

const markdownPreviewRuntimeState = vi.hoisted(() => ({
  store: {
    config: {
      theme: {
        global: 'light',
      },
      markdown: {
        inlineCodeClickCopy: false,
        typographer: false,
      },
    },
    externalFileChange: {
      visible: false,
    },
  },
  renderedHtml: '',
  mermaidInitialize: vi.fn(),
  mermaidRun: vi.fn(),
  mdSet: vi.fn(),
  mdRender: vi.fn(() => markdownPreviewRuntimeState.renderedHtml),
  syncCodeBlockActionVariables: vi.fn(),
  loadCodeTheme: vi.fn(async () => {}),
  handlePreviewHashAnchorClick: vi.fn(() => false),
  settleMermaidRender: vi.fn(async () => {}),
  messageWarning: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
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
    warning: markdownPreviewRuntimeState.messageWarning,
    success: markdownPreviewRuntimeState.messageSuccess,
    error: markdownPreviewRuntimeState.messageError,
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

const { default: MarkdownPreview } = await import('../MarkdownPreview.vue')

const WatermarkStub = defineComponent({
  name: 'AWatermarkStub',
  setup(_props, { slots }) {
    return () => slots.default?.()
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

function mountMarkdownPreview() {
  return mount(MarkdownPreview, {
    props: {
      content: '![说明](README)',
      codeTheme: 'atom-one-dark',
      previewTheme: 'github',
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

async function flushPreviewRender() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('markdownPreview runtime contextmenu', () => {
  beforeEach(() => {
    markdownPreviewRuntimeState.renderedHtml = [
      '<p data-line-start="3" data-line-end="3">',
      '<img',
      ' src="wj://local/README"',
      ' data-wj-resource-kind="image"',
      ' data-wj-resource-src="README"',
      ' data-wj-resource-raw="README"',
      ' data-wj-markdown-reference="![说明](README)"',
      '>',
      '</p>',
    ].join('')
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('右键预览资源时会把 DOM 上的 markdown reference 透传到 previewContextmenu 上下文', async () => {
    const wrapper = mountMarkdownPreview()

    await flushPreviewRender()

    await wrapper.get('img[data-wj-resource-src="README"]').trigger('contextmenu', {
      clientX: 180,
      clientY: 260,
    })

    const previewContextmenuEvents = wrapper.emitted('previewContextmenu') || []
    expect(previewContextmenuEvents).toHaveLength(1)
    expect(previewContextmenuEvents[0][0]).toEqual({
      type: 'resource',
      asset: {
        assetType: 'image',
        sourceType: 'local',
        rawSrc: 'README',
        rawPath: 'README',
        resourceUrl: 'wj://local/README',
        markdownReference: '![说明](README)',
        occurrence: 1,
        lineStart: 3,
        lineEnd: 3,
      },
      menuPosition: {
        x: 180,
        y: 260,
      },
    })
  })
})
