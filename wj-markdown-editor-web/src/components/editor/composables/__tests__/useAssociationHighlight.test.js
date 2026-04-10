import assert from 'node:assert/strict'

import { createPreviewLayoutIndex } from '../../../../util/editor/previewLayoutIndexUtil.js'
import { useAssociationHighlight } from '../useAssociationHighlight.js'

const { after, test } = await import('node:test')

class FakeClassList {
  constructor() {
    this.classNameSet = new Set()
  }

  add(...classNameList) {
    classNameList.forEach(className => this.classNameSet.add(className))
  }

  remove(...classNameList) {
    classNameList.forEach(className => this.classNameSet.delete(className))
  }

  contains(className) {
    return this.classNameSet.has(className)
  }
}

class FakeElement {
  constructor({ dataset = {}, tagName = 'div' } = {}) {
    this.dataset = dataset
    this.tagName = tagName.toUpperCase()
    this.parentElement = null
    this.children = []
    this.classList = new FakeClassList()
    this.isConnected = true
  }

  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
    return child
  }

  contains(target) {
    let current = target ?? null
    while (current) {
      if (current === this) {
        return true
      }
      current = current.parentElement ?? null
    }
    return false
  }

  querySelectorAll(selector) {
    if (selector !== '[data-line-start]') {
      return []
    }

    const result = []
    const stack = [...this.children]
    while (stack.length > 0) {
      const current = stack.shift()
      if (current?.dataset?.lineStart !== undefined) {
        result.push(current)
      }
      stack.unshift(...(current?.children ?? []))
    }
    return result
  }

  closest(selector) {
    if (selector !== '[data-line-start]') {
      return null
    }

    let current = this
    while (current) {
      if (current?.dataset?.lineStart !== undefined) {
        return current
      }
      current = current.parentElement ?? null
    }
    return null
  }
}

const originalElement = globalThis.Element
globalThis.Element = FakeElement

after(() => {
  globalThis.Element = originalElement
})

function createPreviewRoot() {
  return new FakeElement({ tagName: 'section' })
}

function createPreviewBlock({ lineStart, lineEnd = lineStart, tagName = 'p' }) {
  return new FakeElement({
    tagName,
    dataset: {
      lineStart: String(lineStart),
      lineEnd: String(lineEnd),
    },
  })
}

function createEditorView({ currentLine = 1, lines = 20 } = {}) {
  const dispatchCalls = []

  return {
    dispatchCalls,
    view: {
      state: {
        doc: {
          lines,
          lineAt() {
            return {
              number: currentLine,
            }
          },
        },
        selection: {
          main: {
            to: 0,
          },
        },
      },
      dispatch(payload) {
        dispatchCalls.push(payload)
      },
    },
  }
}

function createHarness({
  currentLine = 1,
  lines = 20,
  previewLayoutIndex,
  previewRoot,
} = {}) {
  const { dispatchCalls, view } = createEditorView({ currentLine, lines })
  const composable = useAssociationHighlight({
    editorViewRef: { value: view },
    previewRef: { value: previewRoot },
    previewController: { value: true },
    associationHighlight: { value: true },
    themeRef: { value: 'light' },
    previewLayoutIndex,
  })

  return {
    dispatchCalls,
    ...composable,
  }
}

function getLastDispatchedLineRange(dispatchCalls) {
  return dispatchCalls.at(-1)?.effects?.value ?? null
}

function installFakeAnimationFrame() {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const callbackQueue = []

  globalThis.requestAnimationFrame = (callback) => {
    callbackQueue.push(callback)
    return callbackQueue.length
  }
  globalThis.cancelAnimationFrame = () => {}

  return {
    flushNext(timestamp = 16) {
      const callback = callbackQueue.shift()
      assert.ok(callback, '应存在待执行的 requestAnimationFrame 回调')
      callback(timestamp)
    },
    restore() {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    },
  }
}

test('光标联动高亮在索引可用时，应优先命中 previewLayoutIndex 节点', () => {
  const previewRoot = createPreviewRoot()
  const indexedBlock = previewRoot.appendChild(createPreviewBlock({ lineStart: 3 }))
  previewRoot.appendChild(createPreviewBlock({ lineStart: 3, tagName: 'div' }))

  const previewLayoutIndex = createPreviewLayoutIndex()
  previewLayoutIndex.rebuild(previewRoot)
  previewRoot.querySelectorAll = () => {
    throw new Error('索引命中时不应走 legacy DOM 查询')
  }

  const scheduler = installFakeAnimationFrame()

  try {
    const { dispatchCalls, highlightByEditorCursor } = createHarness({
      currentLine: 3,
      previewLayoutIndex,
      previewRoot,
    })

    highlightByEditorCursor()
    scheduler.flushNext()

    assert.equal(indexedBlock.classList.contains('wj-preview-link-highlight'), true)
    assert.deepEqual(getLastDispatchedLineRange(dispatchCalls), {
      startLine: 3,
      endLine: 3,
    })
  } finally {
    scheduler.restore()
  }
})

test('光标联动高亮在缺少 previewLayoutIndex 时，应回退到 shared helper 的 legacy DOM 查找', () => {
  const previewRoot = createPreviewRoot()
  const fallbackBlock = previewRoot.appendChild(createPreviewBlock({ lineStart: 4 }))
  const scheduler = installFakeAnimationFrame()

  try {
    const { dispatchCalls, highlightByEditorCursor } = createHarness({
      currentLine: 4,
      previewRoot,
    })

    highlightByEditorCursor()
    scheduler.flushNext()

    assert.equal(fallbackBlock.classList.contains('wj-preview-link-highlight'), true)
    assert.deepEqual(getLastDispatchedLineRange(dispatchCalls), {
      startLine: 4,
      endLine: 4,
    })
  } finally {
    scheduler.restore()
  }
})

test('光标联动高亮在索引命中失效节点时，应自动回退到 shared helper 的 legacy DOM 查找', () => {
  const previewRoot = createPreviewRoot()
  const staleBlock = previewRoot.appendChild(createPreviewBlock({ lineStart: 5 }))
  const fallbackBlock = previewRoot.appendChild(createPreviewBlock({ lineStart: 5, tagName: 'div' }))

  const previewLayoutIndex = createPreviewLayoutIndex()
  previewLayoutIndex.rebuild(previewRoot)
  staleBlock.isConnected = false

  const scheduler = installFakeAnimationFrame()

  try {
    const { dispatchCalls, highlightByEditorCursor } = createHarness({
      currentLine: 5,
      previewLayoutIndex,
      previewRoot,
    })

    highlightByEditorCursor()
    scheduler.flushNext()

    assert.equal(staleBlock.classList.contains('wj-preview-link-highlight'), false)
    assert.equal(fallbackBlock.classList.contains('wj-preview-link-highlight'), true)
    assert.deepEqual(getLastDispatchedLineRange(dispatchCalls), {
      startLine: 5,
      endLine: 5,
    })
  } finally {
    scheduler.restore()
  }
})

test('普通输入路径请求 previewOnly 高亮时，只刷新预览侧，不再向编辑器追加装饰事务', () => {
  const previewRoot = createPreviewRoot()
  const previewBlock = previewRoot.appendChild(createPreviewBlock({ lineStart: 6 }))
  const scheduler = installFakeAnimationFrame()

  try {
    const { dispatchCalls, highlightByEditorCursor } = createHarness({
      currentLine: 6,
      previewRoot,
    })

    highlightByEditorCursor(undefined, {
      previewOnly: true,
    })
    scheduler.flushNext()

    assert.equal(previewBlock.classList.contains('wj-preview-link-highlight'), true)
    assert.equal(dispatchCalls.length, 0)
  } finally {
    scheduler.restore()
  }
})

test('同一行先执行 previewOnly 再执行完整高亮时，必须允许补回编辑区装饰事务', () => {
  const previewRoot = createPreviewRoot()
  previewRoot.appendChild(createPreviewBlock({ lineStart: 8 }))
  const scheduler = installFakeAnimationFrame()

  try {
    const { dispatchCalls, highlightByEditorCursor } = createHarness({
      currentLine: 8,
      previewRoot,
    })

    highlightByEditorCursor(undefined, {
      previewOnly: true,
    })
    scheduler.flushNext()
    assert.equal(dispatchCalls.length, 0)

    highlightByEditorCursor()
    scheduler.flushNext()

    assert.deepEqual(getLastDispatchedLineRange(dispatchCalls), {
      startLine: 8,
      endLine: 8,
    })
  } finally {
    scheduler.restore()
  }
})

test('点击预览区后，双侧高亮仍按 data-line-start / data-line-end 语义生效', () => {
  const previewRoot = createPreviewRoot()
  const previewBlock = previewRoot.appendChild(createPreviewBlock({ lineStart: 3, lineEnd: 5 }))
  const previewInner = previewBlock.appendChild(new FakeElement({ tagName: 'span' }))

  const { dispatchCalls, onPreviewAreaClick } = createHarness({
    currentLine: 1,
    previewRoot,
  })

  onPreviewAreaClick({
    target: previewInner,
  })

  assert.equal(previewBlock.classList.contains('wj-preview-link-highlight'), true)
  assert.deepEqual(getLastDispatchedLineRange(dispatchCalls), {
    startLine: 3,
    endLine: 5,
  })
})

test('点击预览区资源链接或脚注锚点时，不会阻断既有 click 委托链路', () => {
  const previewRoot = createPreviewRoot()
  const previewBlock = previewRoot.appendChild(createPreviewBlock({ lineStart: 7 }))
  const anchorElement = previewBlock.appendChild(new FakeElement({ tagName: 'a' }))
  let preventDefaultCalls = 0
  let stopPropagationCalls = 0

  const { dispatchCalls, onPreviewAreaClick } = createHarness({
    currentLine: 1,
    previewRoot,
  })

  onPreviewAreaClick({
    target: anchorElement,
    preventDefault() {
      preventDefaultCalls++
    },
    stopPropagation() {
      stopPropagationCalls++
    },
  })

  assert.equal(preventDefaultCalls, 0)
  assert.equal(stopPropagationCalls, 0)
  assert.equal(previewBlock.classList.contains('wj-preview-link-highlight'), true)
  assert.deepEqual(getLastDispatchedLineRange(dispatchCalls), {
    startLine: 7,
    endLine: 7,
  })
})
