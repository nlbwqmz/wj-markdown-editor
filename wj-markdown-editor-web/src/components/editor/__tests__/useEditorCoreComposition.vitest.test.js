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

    view.domHandlers.compositionstart?.({}, view)
    view.composing = false
    view.compositionStarted = false
    view.domHandlers.compositionend?.({}, view)

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

    view.domHandlers.compositionstart?.({}, view)
    view.composing = false
    view.compositionStarted = true
    view.domHandlers.compositionend?.({}, view)

    await Promise.resolve()
    expect(onCompositionIdle).not.toHaveBeenCalled()

    view.compositionStarted = false
    view.updateListener?.({
      docChanged: false,
      selectionSet: false,
    })

    expect(onCompositionIdle).toHaveBeenCalledTimes(1)
  })

  it('一个标签的 composition 兜底标记不得阻塞其它标签的正文同步', async () => {
    const { activateEditorView, initEditor } = useEditorCore({
      editorRef: {
        value: {},
      },
    })

    const firstDocChange = vi.fn()
    const secondDocChange = vi.fn()

    const firstView = initEditor({
      sessionId: 'session-a',
      doc: 'A',
      theme: 'light',
      keymapList: [],
      onDocChange: firstDocChange,
    })
    const secondView = initEditor({
      sessionId: 'session-b',
      doc: 'B',
      theme: 'light',
      keymapList: [],
      onDocChange: secondDocChange,
    })

    // 模拟 Linux 输入法：A 收到 compositionstart，view 被隐藏后却漏投 compositionend
    firstView.domHandlers.compositionstart({}, firstView)

    activateEditorView('session-b')
    secondView.updateListener({ docChanged: true, selectionSet: false, view: secondView })

    expect(secondDocChange).toHaveBeenCalledTimes(1)
    expect(firstDocChange).not.toHaveBeenCalled()
  })

  it('切走标签时必须清掉旧 view 的兜底标记，切回后正文同步仍能继续', async () => {
    const { activateEditorView, initEditor } = useEditorCore({
      editorRef: {
        value: {},
      },
    })

    const firstDocChange = vi.fn()

    const firstView = initEditor({
      sessionId: 'session-a',
      doc: 'A',
      theme: 'light',
      keymapList: [],
      onDocChange: firstDocChange,
    })
    initEditor({
      sessionId: 'session-b',
      doc: 'B',
      theme: 'light',
      keymapList: [],
    })

    activateEditorView('session-a')
    firstView.domHandlers.compositionstart({}, firstView)

    // 组合输入未结束就切到 B，B 也不会投递 A 的 compositionend
    activateEditorView('session-b')
    activateEditorView('session-a')

    firstView.updateListener({ docChanged: true, selectionSet: false, view: firstView })

    expect(firstDocChange).toHaveBeenCalledTimes(1)
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
})
