import { afterEach, describe, expect, it } from 'vitest'

import { useEditorCore } from '../composables/useEditorCore.js'

const t = key => key

function createContainer() {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return element
}

describe('useEditorCore 多标签 EditorView', () => {
  const containers = []

  afterEach(() => {
    for (const element of containers) {
      element.remove()
    }
    containers.length = 0
  })

  it('行号关闭后再打开必须生效', () => {
    const container = createContainer()
    containers.push(container)

    const { initEditor, reconfigureExtensions, destroyEditor } = useEditorCore({
      editorRef: { value: null },
      t,
    })

    initEditor({
      sessionId: 'tab-a',
      container,
      doc: '# a',
      theme: 'light',
      extensionOptions: { lineNumbers: false },
      keymapList: [],
    })

    // 关闭状态：行号 gutter 不应存在
    expect(container.querySelector('.cm-lineNumbers')).toBeNull()

    reconfigureExtensions({ lineNumbers: true })

    // 关键回归：compartment 在关闭时也必须已经注册，
    // 否则 reconfigure 的 effect 会被静默丢弃，行号永远打不开。
    expect(container.querySelector('.cm-lineNumbers')).not.toBeNull()

    destroyEditor()
  })

  it('每个标签的 view 相互独立，销毁一个不影响另一个', () => {
    const containerA = createContainer()
    const containerB = createContainer()
    containers.push(containerA, containerB)

    const {
      initEditor,
      activateEditorView,
      destroyEditorView,
      editorView,
      destroyEditor,
    } = useEditorCore({ editorRef: { value: null }, t })

    const viewA = initEditor({
      sessionId: 'a',
      container: containerA,
      doc: 'aaa',
      theme: 'light',
      keymapList: [],
    })
    const viewB = initEditor({
      sessionId: 'b',
      container: containerB,
      doc: 'bbb',
      theme: 'light',
      keymapList: [],
    })

    expect(viewA).not.toBe(viewB)
    // initEditor 之后活动 view 是刚创建的那个
    expect(editorView.value).toBe(viewB)

    activateEditorView('a')
    expect(editorView.value).toBe(viewA)
    expect(editorView.value.state.doc.toString()).toBe('aaa')

    // 销毁 B 不应影响 A
    destroyEditorView('b')
    expect(editorView.value).toBe(viewA)
    expect(editorView.value.state.doc.toString()).toBe('aaa')
    expect(viewB.state.doc.toString()).toBe('bbb')

    destroyEditor()
  })

  it('配置变更必须同步到所有标签的 view', () => {
    const containerA = createContainer()
    const containerB = createContainer()
    containers.push(containerA, containerB)

    const {
      initEditor,
      reconfigureExtensions,
      destroyEditor,
    } = useEditorCore({ editorRef: { value: null }, t })

    initEditor({
      sessionId: 'a',
      container: containerA,
      doc: 'aaa',
      theme: 'light',
      extensionOptions: { lineNumbers: false },
      keymapList: [],
    })
    initEditor({
      sessionId: 'b',
      container: containerB,
      doc: 'bbb',
      theme: 'light',
      extensionOptions: { lineNumbers: false },
      keymapList: [],
    })

    expect(containerA.querySelector('.cm-lineNumbers')).toBeNull()
    expect(containerB.querySelector('.cm-lineNumbers')).toBeNull()

    reconfigureExtensions({ lineNumbers: true })

    // 后台标签的 view 也必须被同步，否则切回去会看到旧配置
    expect(containerA.querySelector('.cm-lineNumbers')).not.toBeNull()
    expect(containerB.querySelector('.cm-lineNumbers')).not.toBeNull()

    destroyEditor()
  })
})
