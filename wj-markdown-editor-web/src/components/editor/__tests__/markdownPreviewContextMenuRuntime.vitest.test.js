import { mount } from '@vue/test-utils'
import MarkdownIt from 'markdown-it'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import markdownItImage from '@/util/markdown-it/markdownItImage.js'
import markdownItLineNumber from '@/util/markdown-it/markdownItLineNumber.js'
import markdownItLink from '@/util/markdown-it/markdownItLink.js'

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

vi.mock('@/util/commonUtil.js', async () => {
  const actual = await vi.importActual('@/util/resourceUrlUtil.js')
  return {
    default: {
      convertResourceUrl: actual.convertResourceUrl,
    },
  }
})

vi.mock('vue-i18n', () => ({
  createI18n() {
    return {
      global: {
        t(key) {
          return key
        },
      },
    }
  },
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

function renderPreviewHtml(markdown) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
    xhtmlOut: true,
  })
  markdownItImage(md)
  markdownItLink(md)
  markdownItLineNumber(md)
  return md.render(markdown)
}

async function flushPreviewRender() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('markdownPreview runtime contextmenu', () => {
  beforeEach(() => {
    markdownPreviewRuntimeState.mdRender.mockImplementation(() => markdownPreviewRuntimeState.renderedHtml)
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

  it('右键预览资源时会兼容 data-wj-resource-markdown-reference 并透传到 previewContextmenu 上下文', async () => {
    markdownPreviewRuntimeState.renderedHtml = [
      '<p data-line-start="4" data-line-end="4">',
      '<img',
      ' src="wj://local/README"',
      ' data-wj-resource-kind="image"',
      ' data-wj-resource-src="README"',
      ' data-wj-resource-raw="README"',
      ' data-wj-resource-markdown-reference="![兼容](README)"',
      '>',
      '</p>',
    ].join('')

    const wrapper = mountMarkdownPreview()

    await flushPreviewRender()

    await wrapper.get('img[data-wj-resource-src="README"]').trigger('contextmenu', {
      clientX: 210,
      clientY: 310,
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
        markdownReference: '![兼容](README)',
        occurrence: 1,
        lineStart: 4,
        lineEnd: 4,
      },
      menuPosition: {
        x: 210,
        y: 310,
      },
    })
  })

  it('右键预览资源时，只有行级 markdown reference dataset 而资源节点自身缺失时，应稳定返回 null', async () => {
    markdownPreviewRuntimeState.renderedHtml = [
      '<p data-line-start="5" data-line-end="5" data-wj-markdown-reference="[行级引用](README)">',
      '<img',
      ' src="wj://local/README"',
      ' data-wj-resource-kind="image"',
      ' data-wj-resource-src="README"',
      ' data-wj-resource-raw="README"',
      '>',
      '</p>',
    ].join('')

    const wrapper = mountMarkdownPreview()

    await flushPreviewRender()

    await wrapper.get('img[data-wj-resource-src="README"]').trigger('contextmenu', {
      clientX: 200,
      clientY: 300,
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
        markdownReference: null,
        occurrence: 1,
        lineStart: 5,
        lineEnd: 5,
      },
      menuPosition: {
        x: 200,
        y: 300,
      },
    })
  })

  it('真实渲染的远程图片右键时，会透传 remote 资源上下文与 markdown reference', async () => {
    markdownPreviewRuntimeState.mdRender.mockImplementation(doc => renderPreviewHtml(doc))

    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '![远程图](https://example.com/assets/demo.png)',
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

    await flushPreviewRender()

    await wrapper.get('img[data-wj-resource-src="https://example.com/assets/demo.png"]').trigger('contextmenu', {
      clientX: 188,
      clientY: 288,
    })

    const previewContextmenuEvents = wrapper.emitted('previewContextmenu') || []
    expect(previewContextmenuEvents).toHaveLength(1)
    expect(previewContextmenuEvents[0][0]).toEqual({
      type: 'resource',
      asset: {
        assetType: 'image',
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo.png',
        rawPath: 'https://example.com/assets/demo.png',
        resourceUrl: 'https://example.com/assets/demo.png',
        markdownReference: '![远程图](https://example.com/assets/demo.png)',
        occurrence: 1,
        lineStart: 1,
        lineEnd: 1,
      },
      menuPosition: {
        x: 188,
        y: 288,
      },
    })
  })

  it('点击远程链接时不应触发 assetOpen，而本地链接仍应保留原有打开所在目录行为', async () => {
    markdownPreviewRuntimeState.mdRender.mockImplementation(doc => renderPreviewHtml(doc))

    const remoteWrapper = mount(MarkdownPreview, {
      props: {
        content: '[远程链接](https://example.com/docs)',
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

    await flushPreviewRender()
    await remoteWrapper.get('a[data-wj-resource-src="https://example.com/docs"]').trigger('click')

    expect(remoteWrapper.emitted('assetOpen')).toBeUndefined()

    const localWrapper = mount(MarkdownPreview, {
      props: {
        content: '[本地链接](README)',
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

    await flushPreviewRender()
    await localWrapper.get('a[data-wj-resource-src="README"]').trigger('click')

    const assetOpenEvents = localWrapper.emitted('assetOpen') || []
    expect(assetOpenEvents).toHaveLength(1)
    expect(assetOpenEvents[0][0]).toMatchObject({
      kind: 'link',
      assetType: 'link',
      rawSrc: 'README',
      rawPath: 'README',
    })
    expect(assetOpenEvents[0][0].resourceUrl.startsWith('wj://')).toBe(true)
  })
})
