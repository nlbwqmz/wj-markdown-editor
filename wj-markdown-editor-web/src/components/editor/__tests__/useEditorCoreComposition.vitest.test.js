import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isProxy } from 'vue'

const editorViewMockState = vi.hoisted(() => ({
  latestView: null,
}))

vi.mock('@codemirror/state', () => ({
  Compartment: class {
    of(value) {
      return value
    }

    reconfigure(value) {
      return value
    }
  },
}))

vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: {},
}))

vi.mock('@/util/editor/editorExtensionUtil.js', () => ({
  default: {
    getDefault() {
      return []
    },
    getDynamicExtension() {
      return {}
    },
  },
}))

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    constructor(config) {
      this.config = config
      this.composing = false
      this.compositionStarted = false
      this.dispatch = vi.fn()
      this.destroy = vi.fn()
      this.updateListener = null
      this.domHandlers = {}

      for (const extension of config.extensions) {
        if (extension?.kind === 'update-listener') {
          this.updateListener = extension.listener
        }
        if (extension?.kind === 'dom-handlers') {
          this.domHandlers = extension.handlers
        }
      }

      editorViewMockState.latestView = this
    }

    static updateListener = {
      of(listener) {
        return {
          kind: 'update-listener',
          listener,
        }
      },
    }

    static domEventHandlers(handlers) {
      return {
        kind: 'dom-handlers',
        handlers,
      }
    }
  }

  return {
    EditorView: MockEditorView,
    keymap: {
      of(value) {
        return value
      },
    },
  }
})

describe('useEditorCore 组合输入时序', () => {
  let useEditorCore = null

  beforeEach(async () => {
    vi.resetModules()
    editorViewMockState.latestView = null
    ;({ useEditorCore } = await import('../composables/useEditorCore.js'))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('compositionend 后即使没有后续 update，也会在稳定时机冲刷 onCompositionIdle', async () => {
    const { initEditor } = useEditorCore({
      editorRef: {
        value: {},
      },
    })

    const onCompositionIdle = vi.fn()

    initEditor({
      doc: '# 标题',
      theme: 'light',
      keymapList: [],
      onCompositionIdle,
    })

    const view = editorViewMockState.latestView
    expect(view).toBeTruthy()

    view.domHandlers.compositionstart?.()
    view.composing = false
    view.compositionStarted = false
    view.domHandlers.compositionend?.()

    await Promise.resolve()

    expect(onCompositionIdle).toHaveBeenCalledTimes(1)
  })

  it('当 compositionStarted 空窗仍未结束时，不应提前冲刷 onCompositionIdle', async () => {
    const { initEditor } = useEditorCore({
      editorRef: {
        value: {},
      },
    })

    const onCompositionIdle = vi.fn()

    initEditor({
      doc: '# 标题',
      theme: 'light',
      keymapList: [],
      onCompositionIdle,
    })

    const view = editorViewMockState.latestView
    expect(view).toBeTruthy()

    view.domHandlers.compositionstart?.()
    view.composing = false
    view.compositionStarted = true
    view.domHandlers.compositionend?.()

    await Promise.resolve()
    expect(onCompositionIdle).not.toHaveBeenCalled()

    view.compositionStarted = false
    view.updateListener?.({
      docChanged: false,
      selectionSet: false,
    })

    expect(onCompositionIdle).toHaveBeenCalledTimes(1)
  })

  it('editorView 实例不得进入 Vue 深代理链，避免破坏 CodeMirror 内部对象身份', async () => {
    const { initEditor, editorView } = useEditorCore({
      editorRef: {
        value: {},
      },
    })

    initEditor({
      doc: '# 标题',
      theme: 'light',
      keymapList: [],
    })

    const view = editorViewMockState.latestView
    expect(view).toBeTruthy()
    expect(editorView.value).toBe(view)
    expect(isProxy(editorView.value)).toBe(false)
  })

  it('drop 事件必须透传 onDrop 处理结果，让上层能阻止 CodeMirror 内建处理', () => {
    const { initEditor } = useEditorCore({
      editorRef: {
        value: {},
      },
    })

    const dropEvent = { type: 'drop' }
    const onDrop = vi.fn(() => true)

    initEditor({
      doc: '',
      theme: 'light',
      keymapList: [],
      onDrop,
    })

    const view = editorViewMockState.latestView
    expect(view).toBeTruthy()
    expect(view.domHandlers.drop(dropEvent, view)).toBe(true)
    expect(onDrop).toHaveBeenCalledWith(dropEvent, view)
  })

  it('未提供 onDrop 时 drop 事件必须返回 false，保持内建行为', () => {
    const { initEditor } = useEditorCore({
      editorRef: {
        value: {},
      },
    })

    initEditor({
      doc: '',
      theme: 'light',
      keymapList: [],
    })

    const view = editorViewMockState.latestView
    expect(view).toBeTruthy()
    expect(view.domHandlers.drop({ type: 'drop' }, view)).toBe(false)
  })

  it('reapplyLiveConfiguration 必须把当前生效的主题重放给换回的存档状态', () => {
    const { initEditor, reconfigureTheme, reapplyLiveConfiguration } = useEditorCore({
      editorRef: {
        value: {},
      },
    })

    initEditor({
      doc: '# 标题',
      theme: 'light',
      keymapList: [],
    })

    const view = editorViewMockState.latestView
    expect(view).toBeTruthy()

    // 模拟“在另一个标签里把主题改成暗色”
    reconfigureTheme('dark')
    view.dispatch.mockClear()

    // 换回存档状态后重放配置
    expect(reapplyLiveConfiguration()).toBe(true)
    expect(view.dispatch).toHaveBeenCalledTimes(1)

    const { effects } = view.dispatch.mock.calls[0][0]
    // 第一条是主题重配置：暗色时应当带上 oneDark（mock 为 {}）
    expect(effects[0]).toHaveLength(1)
  })

  it('reapplyLiveConfiguration 在浅色主题下必须把主题重配置成空扩展', () => {
    const { initEditor, reapplyLiveConfiguration } = useEditorCore({
      editorRef: {
        value: {},
      },
    })

    initEditor({
      doc: '# 标题',
      theme: 'light',
      keymapList: [],
    })

    const view = editorViewMockState.latestView
    view.dispatch.mockClear()

    reapplyLiveConfiguration()

    const { effects } = view.dispatch.mock.calls[0][0]
    expect(effects[0]).toEqual([])
  })

  it('reapplyLiveConfiguration 在没有编辑器实例时不得报错', () => {
    const { reapplyLiveConfiguration } = useEditorCore({
      editorRef: {
        value: {},
      },
    })

    expect(reapplyLiveConfiguration()).toBe(false)
  })
})
