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
})
