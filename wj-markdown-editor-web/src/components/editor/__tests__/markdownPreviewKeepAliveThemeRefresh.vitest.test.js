import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick, onActivated, reactive, ref } from 'vue'

const markdownPreviewRuntimeState = vi.hoisted(() => ({
  store: null,
  renderedHtml: '<div class="mermaid" data-code="graph TD;A-->B">graph TD;A-->B</div>',
  mermaidInitialize: vi.fn(),
  mermaidRun: vi.fn(async () => {}),
  mdSet: vi.fn(),
  mdRender: vi.fn(() => markdownPreviewRuntimeState.renderedHtml),
  syncCodeBlockActionVariables: vi.fn(),
  loadCodeTheme: vi.fn(async () => {}),
  handlePreviewHashAnchorClick: vi.fn(() => false),
  settleMermaidRender: vi.fn(async () => {}),
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

const InactivePlaceholder = defineComponent({
  name: 'InactivePlaceholder',
  setup() {
    return () => h('div', { 'data-testid': 'inactive-placeholder' })
  },
})

const KeepAliveHost = defineComponent({
  name: 'MarkdownPreviewKeepAliveHost',
  props: {
    active: {
      type: Boolean,
      default: true,
    },
    content: {
      type: String,
      default: '```mermaid\ngraph TD;A-->B\n```',
    },
  },
  setup(props) {
    return () => h(KeepAlive, null, {
      default: () => h(
        props.active === true ? MarkdownPreview : InactivePlaceholder,
        props.active === true
          ? {
              content: props.content,
              codeTheme: 'atom-one-dark',
              previewTheme: 'github',
            }
          : {},
      ),
    })
  },
})

const ActivationReplayParent = defineComponent({
  name: 'ActivationReplayParent',
  props: {
    initialContent: {
      type: String,
      default: 'old-content',
    },
    replayedContent: {
      type: String,
      default: 'new-content',
    },
  },
  setup(props) {
    const content = ref(props.initialContent)
    let hasActivatedOnce = false

    onActivated(() => {
      // 模拟父页面在 keep-alive 恢复时重放最新 snapshot。
      if (hasActivatedOnce !== true) {
        hasActivatedOnce = true
        return
      }
      content.value = props.replayedContent
    })

    return () => h(MarkdownPreview, {
      content: content.value,
      codeTheme: 'atom-one-dark',
      previewTheme: 'github',
    })
  },
})

const ActivationReplayKeepAliveHost = defineComponent({
  name: 'ActivationReplayKeepAliveHost',
  props: {
    active: {
      type: Boolean,
      default: true,
    },
    initialContent: {
      type: String,
      default: 'old-content',
    },
    replayedContent: {
      type: String,
      default: 'new-content',
    },
  },
  setup(props) {
    return () => h(KeepAlive, null, {
      default: () => h(
        props.active === true ? ActivationReplayParent : InactivePlaceholder,
        props.active === true
          ? {
              initialContent: props.initialContent,
              replayedContent: props.replayedContent,
            }
          : {},
      ),
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

describe('markdownPreview keep-alive 主题刷新', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    markdownPreviewRuntimeState.store = createStore()
    markdownPreviewRuntimeState.renderedHtml = '<div class="mermaid" data-code="graph TD;A-->B">graph TD;A-->B</div>'
  })

  afterEach(() => {
    vi.useRealTimers()
    markdownPreviewRuntimeState.store = null
    document.body.innerHTML = ''
  })

  it('失活实例在全局主题切换时不应继续触发 mermaid 渲染，重新激活后再补做刷新', async () => {
    const wrapper = mount(KeepAliveHost, {
      props: {
        active: true,
      },
      global: {
        stubs: {
          'a-watermark': WatermarkStub,
          'a-image-preview-group': ImagePreviewGroupStub,
          'a-image': ImageStub,
        },
      },
    })

    await flushRender()

    expect(markdownPreviewRuntimeState.mermaidInitialize).toHaveBeenCalledTimes(1)
    expect(markdownPreviewRuntimeState.settleMermaidRender).toHaveBeenCalledTimes(1)

    await wrapper.setProps({
      active: false,
    })
    await flushRender()

    markdownPreviewRuntimeState.store.config.theme.global = 'dark'
    await flushRender()

    expect(markdownPreviewRuntimeState.mermaidInitialize).toHaveBeenCalledTimes(1)
    expect(markdownPreviewRuntimeState.settleMermaidRender).toHaveBeenCalledTimes(1)

    await wrapper.setProps({
      active: true,
    })
    await flushRender()

    expect(markdownPreviewRuntimeState.mermaidInitialize).toHaveBeenCalledTimes(2)
    expect(markdownPreviewRuntimeState.mermaidInitialize).toHaveBeenLastCalledWith(expect.objectContaining({
      startOnLoad: false,
      theme: 'dark',
    }))
    expect(markdownPreviewRuntimeState.settleMermaidRender).toHaveBeenCalledTimes(2)
  })

  it('大纲事件会携带标题行号，供目录点击后直接驱动编辑区定位', async () => {
    markdownPreviewRuntimeState.renderedHtml = '<h2 id="wrapped-heading" data-line-start="18" data-line-end="18">自动换行标题</h2>'

    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '## 自动换行标题',
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

    await flushRender()

    expect(wrapper.emitted('anchorChange')).toEqual([
      [[
        {
          key: 'wrapped-heading',
          href: '#wrapped-heading',
          title: '自动换行标题',
          titleHtml: '自动换行标题',
          level: 2,
          lineStart: 18,
          lineEnd: 18,
          children: [],
        },
      ]],
    ])
  })

  it('大纲事件会同时携带标题纯文本与受控富文本，供目录保留行内样式', async () => {
    markdownPreviewRuntimeState.renderedHtml = '<h2 id="rich-heading" data-line-start="24" data-line-end="24">普通<span class="markdown-it-text-color" style="--markdown-it-text-color: red">红色</span><s>删除</s><strong>加粗</strong><em>斜体</em><code>code</code><u>下划线</u></h2>'

    const wrapper = mount(MarkdownPreview, {
      props: {
        content: '## 普通{red}(红色)~~删除~~**加粗***斜体*`code`<u>下划线</u>',
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

    await flushRender()

    expect(wrapper.emitted('anchorChange')).toEqual([
      [[
        {
          key: 'rich-heading',
          href: '#rich-heading',
          title: '普通红色删除加粗斜体code下划线',
          titleHtml: '普通<span class="markdown-it-text-color" style="--markdown-it-text-color: red">红色</span><s>删除</s><strong>加粗</strong><em>斜体</em><code>code</code><u>下划线</u>',
          level: 2,
          lineStart: 24,
          lineEnd: 24,
          children: [],
        },
      ]],
    ])
  })

  it('节流窗口内已排队的内容刷新在 keep-alive 失活后重新激活时必须补做', async () => {
    markdownPreviewRuntimeState.mdRender.mockImplementation(doc => `<div data-rendered-content="${doc}">${doc}</div>`)

    const wrapper = mount(KeepAliveHost, {
      props: {
        active: true,
        content: 'first-content',
      },
      global: {
        stubs: {
          'a-watermark': WatermarkStub,
          'a-image-preview-group': ImagePreviewGroupStub,
          'a-image': ImageStub,
        },
      },
    })

    await flushRender()

    expect(markdownPreviewRuntimeState.mdRender).toHaveBeenCalledTimes(1)
    expect(markdownPreviewRuntimeState.mdRender).toHaveBeenLastCalledWith('first-content', expect.any(Object))

    await wrapper.setProps({
      content: 'second-content',
    })
    await nextTick()

    expect(markdownPreviewRuntimeState.mdRender).toHaveBeenCalledTimes(1)

    await wrapper.setProps({
      active: false,
    })
    await flushRender()

    await wrapper.setProps({
      active: true,
    })
    await flushRender()

    expect(markdownPreviewRuntimeState.mdRender).toHaveBeenCalledTimes(2)
    expect(markdownPreviewRuntimeState.mdRender).toHaveBeenLastCalledWith('second-content', expect.any(Object))
  })

  it('激活补刷必须等待父页面重放最新 snapshot 后再执行，避免先按旧正文补刷', async () => {
    markdownPreviewRuntimeState.mdRender.mockImplementation(doc => `<div data-rendered-content="${doc}">${doc}</div>`)

    const wrapper = mount(ActivationReplayKeepAliveHost, {
      props: {
        active: true,
        initialContent: 'old-content',
        replayedContent: 'new-content',
      },
      global: {
        stubs: {
          'a-watermark': WatermarkStub,
          'a-image-preview-group': ImagePreviewGroupStub,
          'a-image': ImageStub,
        },
      },
    })

    await flushRender()

    expect(markdownPreviewRuntimeState.mdRender).toHaveBeenCalledTimes(1)
    expect(markdownPreviewRuntimeState.mdRender.mock.calls[0][0]).toBe('old-content')

    markdownPreviewRuntimeState.mdRender.mockClear()

    await wrapper.setProps({
      active: false,
    })
    await flushRender()

    markdownPreviewRuntimeState.store.config.theme.global = 'dark'
    await flushRender()

    expect(markdownPreviewRuntimeState.mdRender).not.toHaveBeenCalled()

    await wrapper.setProps({
      active: true,
    })
    await flushRender()

    expect(markdownPreviewRuntimeState.mdRender).toHaveBeenCalledTimes(1)
    expect(markdownPreviewRuntimeState.mdRender.mock.calls[0][0]).toBe('new-content')
  })
})
