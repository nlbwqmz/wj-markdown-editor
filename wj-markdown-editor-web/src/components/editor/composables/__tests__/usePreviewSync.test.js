import assert from 'node:assert/strict'
import { createPreviewLayoutIndex } from '../../../../util/editor/previewLayoutIndexUtil.js'
import { usePreviewSync } from '../usePreviewSync.js'

const { test } = await import('node:test')

const previewElement = {
  scrollTop: 0,
  scrollHeight: 2000,
  clientHeight: 300,
  clientTop: 0,
  registeredElements: [],
  scrollToCalls: [],
  addEventListener() {},
  removeEventListener() {},
  contains(target) {
    return this.registeredElements.includes(target)
  },
  getBoundingClientRect() {
    return {
      top: 0,
    }
  },
  scrollTo({ top }) {
    this.scrollToCalls.push(top)
    this.scrollTop = top
  },
  querySelectorAll() {
    return this.registeredElements
  },
}

function createElement({
  tagName = 'div',
  lineStart,
  lineEnd,
  offsetTop,
  actualTop,
  height,
  isConnected = true,
}) {
  return {
    tagName: tagName.toUpperCase(),
    dataset: {
      lineStart: String(lineStart),
      lineEnd: String(lineEnd),
    },
    isConnected,
    offsetTop,
    clientTop: 0,
    getBoundingClientRect() {
      return {
        top: actualTop - previewElement.scrollTop,
        height,
      }
    },
  }
}

function setPreviewElements(elements, options = {}) {
  previewElement.registeredElements = elements
  if (typeof options.querySelectorAll === 'function') {
    previewElement.querySelectorAll = options.querySelectorAll
    return
  }
  previewElement.querySelectorAll = () => previewElement.registeredElements
}

function createScrollElement() {
  const listeners = new Map()
  return {
    onscrollend: null,
    scrollTop: 0,
    scrollHeight: 2000,
    clientHeight: 300,
    addEventListener(event, callback) {
      listeners.set(event, callback)
    },
    removeEventListener(event, callback) {
      if (listeners.get(event) === callback) {
        listeners.delete(event)
      }
    },
    scrollTo({ top }) {
      this.scrollTop = top
      const handler = listeners.get('scrollend')
      if (handler) {
        handler()
      }
    },
  }
}

function createAnimatedScrollElement({ durationMs = 1500, steps = 20 } = {}) {
  const listeners = new Map()
  return {
    onscrollend: null,
    scrollTop: 0,
    scrollHeight: 2000,
    clientHeight: 300,
    addEventListener(event, callback) {
      listeners.set(event, callback)
    },
    removeEventListener(event, callback) {
      if (listeners.get(event) === callback) {
        listeners.delete(event)
      }
    },
    scrollTo({ top }) {
      const startTop = this.scrollTop
      for (let step = 1; step <= steps; step++) {
        const progress = step / steps
        setTimeout(() => {
          this.scrollTop = startTop + ((top - startTop) * progress)
          if (step === steps) {
            const handler = listeners.get('scrollend')
            handler && handler()
          }
        }, Math.round(durationMs * progress))
      }
    },
  }
}

function createNonRetargetableSmoothScrollElement({ durationMs = 1200, steps = 12 } = {}) {
  const listeners = new Map()
  let animationRunning = false
  return {
    onscrollend: null,
    scrollTop: 0,
    scrollHeight: 20000,
    clientHeight: 300,
    addEventListener(event, callback) {
      listeners.set(event, callback)
    },
    removeEventListener(event, callback) {
      if (listeners.get(event) === callback) {
        listeners.delete(event)
      }
    },
    scrollTo({ top, behavior } = {}) {
      if (behavior !== 'smooth') {
        this.scrollTop = top
        const handler = listeners.get('scrollend')
        handler && handler()
        return
      }

      if (animationRunning) {
        return
      }

      animationRunning = true
      const startTop = this.scrollTop
      for (let step = 1; step <= steps; step++) {
        const progress = step / steps
        setTimeout(() => {
          this.scrollTop = startTop + ((top - startTop) * progress)
          if (step === steps) {
            animationRunning = false
            const handler = listeners.get('scrollend')
            handler && handler()
          }
        }, Math.round(durationMs * progress))
      }
    },
  }
}

function installFakeScheduler() {
  const originalDateNow = Date.now
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  let now = 0
  let taskId = 0
  const taskQueue = []

  function addTask(type, callback, delay) {
    const id = ++taskId
    taskQueue.push({
      id,
      type,
      callback,
      runAt: now + delay,
    })
    taskQueue.sort((a, b) => a.runAt - b.runAt || a.id - b.id)
    return id
  }

  function removeTask(id) {
    const index = taskQueue.findIndex(task => task.id === id)
    if (index >= 0) {
      taskQueue.splice(index, 1)
    }
  }

  Date.now = () => now
  globalThis.setTimeout = (callback, delay = 0) => addTask('timeout', callback, delay)
  globalThis.clearTimeout = id => removeTask(id)
  globalThis.requestAnimationFrame = callback => addTask('raf', () => callback(now), 16)
  globalThis.cancelAnimationFrame = id => removeTask(id)

  return {
    advanceBy(ms) {
      const targetTime = now + ms
      while (taskQueue.length > 0 && taskQueue[0].runAt <= targetTime) {
        const nextTask = taskQueue.shift()
        now = nextTask.runAt
        nextTask.callback()
      }
      now = targetTime
    },
    restore() {
      Date.now = originalDateNow
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    },
  }
}

function createEditorView(lineHeights) {
  const lineTops = new Map()
  let currentTop = 0
  for (const [lineNumber, height] of lineHeights.entries()) {
    lineTops.set(lineNumber, currentTop)
    currentTop += height
  }
  const scrollDOM = createScrollElement()
  return {
    scrollDOM,
    state: {
      doc: {
        // 为测试提供总行数，模拟 CodeMirror 文档对象的最小能力。
        lines: lineHeights.size,
        line(lineNumber) {
          return { from: lineNumber * 10 }
        },
        // 编辑区同步到预览区时会根据当前位置反查行号，这里补齐测试桩。
        lineAt(from) {
          return { number: Math.floor(from / 10) }
        },
      },
    },
    lineBlockAt(from) {
      const lineNumber = Math.floor(from / 10)
      return {
        top: lineTops.get(lineNumber),
        height: lineHeights.get(lineNumber),
      }
    },
    lineBlockAtHeight(height) {
      let matchedLine = 1
      for (const [lineNumber, top] of lineTops.entries()) {
        if (top <= height) {
          matchedLine = lineNumber
        } else {
          break
        }
      }
      return {
        from: matchedLine * 10,
        top: lineTops.get(matchedLine),
        height: lineHeights.get(matchedLine),
      }
    },
  }
}

/**
 * 创建会在首轮滚动后切换到真实行高的编辑器桩。
 * 该桩用于复现 CodeMirror 在自动换行场景下，对离屏行先给估算高度、
 * 滚动到附近后再纠正为真实高度的行为。
 */
function createAdaptiveMeasuredEditorView({
  estimatedLineHeights,
  measuredLineHeights,
  measuredScrollTopThreshold = 0,
}) {
  const scrollDOM = createScrollElement()

  function getActiveLineHeights() {
    return scrollDOM.scrollTop >= measuredScrollTopThreshold
      ? measuredLineHeights
      : estimatedLineHeights
  }

  function createLineTops(lineHeights) {
    const lineTops = new Map()
    let currentTop = 0
    for (const [lineNumber, height] of lineHeights.entries()) {
      lineTops.set(lineNumber, currentTop)
      currentTop += height
    }
    return lineTops
  }

  function getLineMetrics(lineNumber) {
    const lineHeights = getActiveLineHeights()
    const lineTops = createLineTops(lineHeights)
    return {
      top: lineTops.get(lineNumber),
      height: lineHeights.get(lineNumber),
    }
  }

  return {
    scrollDOM,
    state: {
      doc: {
        lines: measuredLineHeights.size,
        line(lineNumber) {
          return { from: lineNumber * 10 }
        },
        lineAt(from) {
          return { number: Math.floor(from / 10) }
        },
      },
    },
    lineBlockAt(from) {
      const lineNumber = Math.floor(from / 10)
      const metrics = getLineMetrics(lineNumber)
      return {
        top: metrics.top,
        height: metrics.height,
      }
    },
    lineBlockAtHeight(height) {
      const lineHeights = getActiveLineHeights()
      const lineTops = createLineTops(lineHeights)
      let matchedLine = 1
      for (const [lineNumber, top] of lineTops.entries()) {
        if (top <= height) {
          matchedLine = lineNumber
        } else {
          break
        }
      }
      return {
        from: matchedLine * 10,
        top: lineTops.get(matchedLine),
        height: lineHeights.get(matchedLine),
      }
    },
  }
}

test('编辑区同步到预览区在索引可用时，应优先使用索引命中节点', () => {
  previewElement.scrollTop = 0
  previewElement.scrollToCalls = []

  const lineHeights = new Map([
    [1, 30],
    [2, 30],
    [3, 30],
    [4, 30],
    [5, 30],
  ])
  const editorView = createEditorView(lineHeights)
  editorView.scrollDOM.scrollTop = 45
  const indexedElement = createElement({
    tagName: 'p',
    lineStart: 2,
    lineEnd: 2,
    offsetTop: 60,
    actualTop: 60,
    height: 30,
  })
  setPreviewElements([indexedElement])
  const previewLayoutIndex = createPreviewLayoutIndex()
  previewLayoutIndex.rebuild(previewElement)
  setPreviewElements([indexedElement], {
    querySelectorAll() {
      throw new Error('索引命中时不应回退到 legacy querySelectorAll 路径')
    },
  })

  const { syncEditorToPreview, clearScrollTimer } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop: { value: 0 },
    previewLayoutIndex,
  })

  try {
    syncEditorToPreview()

    assert.deepEqual(previewElement.scrollToCalls, [75])
    assert.equal(previewElement.scrollTop, 75)
  } finally {
    clearScrollTimer()
  }
})

test('编辑区同步到预览区在索引命中失效元素时，应自动回退到 legacy DOM 查找', () => {
  previewElement.scrollTop = 0
  previewElement.scrollToCalls = []

  const lineHeights = new Map([
    [1, 30],
    [2, 30],
    [3, 30],
    [4, 30],
    [5, 30],
  ])
  const editorView = createEditorView(lineHeights)
  editorView.scrollDOM.scrollTop = 45
  const staleElement = createElement({
    tagName: 'p',
    lineStart: 2,
    lineEnd: 2,
    offsetTop: 60,
    actualTop: 60,
    height: 30,
  })
  const fallbackElement = createElement({
    tagName: 'p',
    lineStart: 2,
    lineEnd: 2,
    offsetTop: 80,
    actualTop: 80,
    height: 30,
  })
  setPreviewElements([staleElement, fallbackElement])
  const previewLayoutIndex = createPreviewLayoutIndex()
  previewLayoutIndex.rebuild(previewElement)
  staleElement.isConnected = false

  const { syncEditorToPreview, clearScrollTimer } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop: { value: 0 },
    previewLayoutIndex,
  })

  try {
    syncEditorToPreview()

    assert.deepEqual(previewElement.scrollToCalls, [95])
    assert.equal(previewElement.scrollTop, 95)
  } finally {
    clearScrollTimer()
  }
})

test('预览区同步到编辑区在索引可用时，应优先通过滚动位置 helper 命中节点', () => {
  previewElement.scrollTop = 55
  previewElement.scrollToCalls = []

  const lineHeights = new Map([
    [1, 30],
    [2, 30],
    [3, 30],
    [4, 30],
    [5, 30],
  ])
  const editorView = createEditorView(lineHeights)
  const indexedElement = createElement({
    tagName: 'p',
    lineStart: 2,
    lineEnd: 2,
    offsetTop: 40,
    actualTop: 40,
    height: 30,
  })
  setPreviewElements([indexedElement])
  const previewLayoutIndex = createPreviewLayoutIndex()
  previewLayoutIndex.rebuild(previewElement)
  setPreviewElements([indexedElement], {
    querySelectorAll() {
      throw new Error('滚动位置 helper 命中时不应回退到 legacy querySelectorAll 路径')
    },
  })

  const { syncPreviewToEditor, clearScrollTimer } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop: { value: 0 },
    previewLayoutIndex,
  })

  try {
    syncPreviewToEditor()

    assert.equal(editorView.scrollDOM.scrollTop, 45)
  } finally {
    clearScrollTimer()
  }
})

test('预览区同步到编辑区在滚动位置 helper 失效时，应保留 legacy DOM 回退路径', () => {
  previewElement.scrollTop = 75
  previewElement.scrollToCalls = []

  const lineHeights = new Map([
    [1, 30],
    [2, 30],
    [3, 30],
    [4, 30],
    [5, 30],
  ])
  const editorView = createEditorView(lineHeights)
  const fallbackElement = createElement({
    tagName: 'p',
    lineStart: 2,
    lineEnd: 2,
    offsetTop: 40,
    actualTop: 40,
    height: 30,
  })
  const staleElement = createElement({
    tagName: 'p',
    lineStart: 3,
    lineEnd: 3,
    offsetTop: 70,
    actualTop: 70,
    height: 30,
  })
  setPreviewElements([fallbackElement, staleElement])
  const previewLayoutIndex = createPreviewLayoutIndex()
  previewLayoutIndex.rebuild(previewElement)
  staleElement.isConnected = false

  const { syncPreviewToEditor, clearScrollTimer } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop: { value: 0 },
    previewLayoutIndex,
  })

  try {
    syncPreviewToEditor()

    assert.equal(editorView.scrollDOM.scrollTop, 60)
  } finally {
    clearScrollTimer()
  }
})

test('编辑区跟随预览平滑滚动超过一秒仍在移动时，不能提前解除同步保护', () => {
  const scheduler = installFakeScheduler()
  previewElement.scrollTop = 55
  previewElement.scrollToCalls = []

  try {
    const lineHeights = new Map([
      [1, 30],
      [2, 30],
      [3, 30],
      [4, 30],
      [5, 30],
    ])
    const editorView = createEditorView(lineHeights)
    editorView.scrollDOM = createAnimatedScrollElement({ durationMs: 1500, steps: 20 })

    const elements = [
      createElement({ tagName: 'p', lineStart: 1, lineEnd: 1, offsetTop: 0, actualTop: 0, height: 30 }),
      createElement({ tagName: 'p', lineStart: 2, lineEnd: 2, offsetTop: 40, actualTop: 40, height: 30 }),
      createElement({ tagName: 'p', lineStart: 3, lineEnd: 3, offsetTop: 80, actualTop: 80, height: 30 }),
    ]
    setPreviewElements(elements)

    const scrolling = { value: { editor: false, preview: false } }
    const editorScrollTop = { value: 0 }
    const { syncPreviewToEditor, syncEditorToPreview } = usePreviewSync({
      editorViewRef: { value: editorView },
      previewRef: { value: previewElement },
      scrolling,
      editorScrollTop,
    })

    syncPreviewToEditor()
    scheduler.advanceBy(1100)

    assert.equal(scrolling.value.preview, true)
    const previewScrollTopBeforeSyncBack = previewElement.scrollTop

    syncEditorToPreview()

    assert.equal(previewElement.scrollTop, previewScrollTopBeforeSyncBack)
    assert.equal(previewElement.scrollToCalls.length, 0)
  } finally {
    scheduler.restore()
  }
})

test('恢复期激活时，编辑区同步到预览区不应触发预览滚动', () => {
  previewElement.scrollTop = 0
  previewElement.scrollToCalls = []

  const lineHeights = new Map([
    [1, 30],
    [2, 30],
    [3, 30],
    [4, 30],
    [5, 30],
  ])
  const editorView = createEditorView(lineHeights)
  editorView.scrollDOM.scrollTop = 45
  const elements = [
    createElement({ tagName: 'p', lineStart: 1, lineEnd: 1, offsetTop: 0, actualTop: 0, height: 30 }),
    createElement({ tagName: 'p', lineStart: 2, lineEnd: 2, offsetTop: 40, actualTop: 40, height: 30 }),
    createElement({ tagName: 'p', lineStart: 3, lineEnd: 3, offsetTop: 80, actualTop: 80, height: 30 }),
  ]
  setPreviewElements(elements)

  const { syncEditorToPreview } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop: { value: 0 },
    // 恢复期内必须直接短路，避免恢复中的滚动位置被另一侧重新覆盖。
    restoreStateRef: { value: { active: true } },
  })

  syncEditorToPreview()

  assert.equal(previewElement.scrollToCalls.length, 0)
})

test('恢复期结束后的首次编辑区同步，不应因滚动缓存滞后误触发预览滚动', () => {
  previewElement.scrollTop = 0
  previewElement.scrollToCalls = []

  const lineHeights = new Map([
    [1, 30],
    [2, 30],
    [3, 30],
    [4, 30],
    [5, 30],
  ])
  const editorView = createEditorView(lineHeights)
  editorView.scrollDOM.scrollTop = 45
  const elements = [
    createElement({ tagName: 'p', lineStart: 1, lineEnd: 1, offsetTop: 0, actualTop: 0, height: 30 }),
    createElement({ tagName: 'p', lineStart: 2, lineEnd: 2, offsetTop: 40, actualTop: 40, height: 30 }),
    createElement({ tagName: 'p', lineStart: 3, lineEnd: 3, offsetTop: 80, actualTop: 80, height: 30 }),
  ]
  setPreviewElements(elements)

  // 这里模拟“恢复期内编辑器已经到达目标位置，但 editorScrollTop 旧缓存仍停留在恢复前”的场景。
  // 若恢复期短路时不顺便刷新缓存，恢复结束后的首次同步就会把同一个滚动值误判为新滚动。
  const restoreStateRef = { value: { active: true } }
  const editorScrollTop = { value: 0 }
  const { syncEditorToPreview, clearScrollTimer } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop,
    restoreStateRef,
  })

  try {
    syncEditorToPreview()
    restoreStateRef.value.active = false
    syncEditorToPreview()

    assert.equal(previewElement.scrollToCalls.length, 0)
    assert.equal(editorScrollTop.value, 45)
  } finally {
    clearScrollTimer()
  }
})

test('省略 restoreStateRef 时，编辑区同步到预览区仍保持原有行为', () => {
  previewElement.scrollTop = 0
  previewElement.scrollToCalls = []

  const lineHeights = new Map([
    [1, 30],
    [2, 30],
    [3, 30],
    [4, 30],
    [5, 30],
  ])
  const editorView = createEditorView(lineHeights)
  editorView.scrollDOM.scrollTop = 45
  const elements = [
    createElement({ tagName: 'p', lineStart: 1, lineEnd: 1, offsetTop: 0, actualTop: 0, height: 30 }),
    createElement({ tagName: 'p', lineStart: 2, lineEnd: 2, offsetTop: 40, actualTop: 40, height: 30 }),
    createElement({ tagName: 'p', lineStart: 3, lineEnd: 3, offsetTop: 80, actualTop: 80, height: 30 }),
  ]
  setPreviewElements(elements)

  const { syncEditorToPreview, clearScrollTimer } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop: { value: 0 },
  })

  try {
    syncEditorToPreview()

    assert.deepEqual(previewElement.scrollToCalls, [55])
    assert.equal(previewElement.scrollTop, 55)
  } finally {
    clearScrollTimer()
  }
})

test('恢复期激活时，预览区同步到编辑区不应触发编辑区滚动', () => {
  previewElement.scrollTop = 55
  previewElement.scrollToCalls = []

  const lineHeights = new Map([
    [1, 30],
    [2, 30],
    [3, 30],
    [4, 30],
    [5, 30],
  ])
  const editorView = createEditorView(lineHeights)
  const elements = [
    createElement({ tagName: 'p', lineStart: 1, lineEnd: 1, offsetTop: 0, actualTop: 0, height: 30 }),
    createElement({ tagName: 'p', lineStart: 2, lineEnd: 2, offsetTop: 40, actualTop: 40, height: 30 }),
    createElement({ tagName: 'p', lineStart: 3, lineEnd: 3, offsetTop: 80, actualTop: 80, height: 30 }),
  ]
  setPreviewElements(elements)

  const { syncPreviewToEditor } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop: { value: 0 },
    // 恢复期内禁止反向推动编辑区，确保恢复结果保持稳定。
    restoreStateRef: { value: { active: true } },
  })

  syncPreviewToEditor()

  assert.equal(editorView.scrollDOM.scrollTop, 0)
})

test('预览区普通块元素滚动时可同步到编辑区对应行', () => {
  const lineHeights = new Map([
    [1, 30],
    [2, 30],
    [3, 30],
    [4, 30],
    [5, 30],
  ])
  const editorView = createEditorView(lineHeights)
  const elements = [
    createElement({ tagName: 'p', lineStart: 1, lineEnd: 1, offsetTop: 0, actualTop: 0, height: 30 }),
    createElement({ tagName: 'p', lineStart: 2, lineEnd: 2, offsetTop: 40, actualTop: 40, height: 30 }),
    createElement({ tagName: 'p', lineStart: 3, lineEnd: 3, offsetTop: 80, actualTop: 80, height: 30 }),
  ]
  setPreviewElements(elements)
  previewElement.scrollTop = 55

  const { syncPreviewToEditor } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop: { value: 0 },
  })

  syncPreviewToEditor()

  assert.equal(editorView.scrollDOM.scrollTop, 45)
})

test('预览区同步到编辑区在自动换行导致离屏行高先估算后纠正时，应在首轮滚动后再校正一次目标位置', () => {
  previewElement.scrollTop = 210
  previewElement.scrollToCalls = []

  const editorView = createAdaptiveMeasuredEditorView({
    estimatedLineHeights: new Map([
      [1, 30],
      [2, 30],
      [3, 30],
      [4, 30],
    ]),
    measuredLineHeights: new Map([
      [1, 30],
      [2, 120],
      [3, 30],
      [4, 30],
    ]),
    measuredScrollTopThreshold: 60,
  })
  setPreviewElements([
    createElement({ tagName: 'p', lineStart: 1, lineEnd: 4, offsetTop: 0, actualTop: 0, height: 280 }),
  ])

  const { syncPreviewToEditor, clearScrollTimer } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop: { value: 0 },
  })

  try {
    syncPreviewToEditor()

    assert.equal(
      editorView.scrollDOM.scrollTop,
      157.5,
      '首轮近似滚动后，编辑区应基于已测得的真实换行高度再校正到最终位置',
    )
  } finally {
    clearScrollTimer()
  }
})

test('预览区滚动到表格中部时，应按预览容器坐标而不是嵌套节点 offsetTop 选择行', () => {
  const lineHeights = new Map([
    [1, 30],
    [2, 30],
    [3, 30],
    [4, 30],
    [5, 30],
    [6, 30],
    [7, 30],
    [8, 30],
    [9, 30],
  ])
  const editorView = createEditorView(lineHeights)
  const elements = [
    createElement({ tagName: 'p', lineStart: 1, lineEnd: 1, offsetTop: 128, actualTop: 128, height: 24 }),
    createElement({ tagName: 'table', lineStart: 4, lineEnd: 8, offsetTop: 168, actualTop: 168, height: 260 }),
    createElement({ tagName: 'thead', lineStart: 4, lineEnd: 5, offsetTop: 0, actualTop: 168, height: 40 }),
    createElement({ tagName: 'tr', lineStart: 4, lineEnd: 5, offsetTop: 0, actualTop: 168, height: 40 }),
    createElement({ tagName: 'tbody', lineStart: 6, lineEnd: 8, offsetTop: 49, actualTop: 218, height: 210 }),
    createElement({ tagName: 'tr', lineStart: 6, lineEnd: 7, offsetTop: 49, actualTop: 218, height: 100 }),
    createElement({ tagName: 'tr', lineStart: 7, lineEnd: 8, offsetTop: 154, actualTop: 323, height: 100 }),
    createElement({ tagName: 'p', lineStart: 9, lineEnd: 9, offsetTop: 444, actualTop: 444, height: 24 }),
  ]
  setPreviewElements(elements)
  previewElement.scrollTop = 220

  const { syncPreviewToEditor } = usePreviewSync({
    editorViewRef: { value: editorView },
    previewRef: { value: previewElement },
    scrolling: { value: { editor: false, preview: false } },
    editorScrollTop: { value: 0 },
  })

  syncPreviewToEditor()

  assert.equal(editorView.scrollDOM.scrollTop, 151.2)
})

test('预览区连续长距离滚动时，编辑区跟随不应被自身 smooth 动画锁在早期目标', () => {
  const scheduler = installFakeScheduler()
  previewElement.scrollTop = 0
  previewElement.scrollToCalls = []

  try {
    const lineHeights = new Map([
      [1, 1000],
      [2, 1000],
      [3, 1000],
      [4, 1000],
    ])
    const editorView = createEditorView(lineHeights)
    editorView.scrollDOM = createNonRetargetableSmoothScrollElement({
      durationMs: 1200,
      steps: 12,
    })

    setPreviewElements([
      createElement({ tagName: 'p', lineStart: 1, lineEnd: 1, offsetTop: 0, actualTop: 0, height: 1000 }),
      createElement({ tagName: 'p', lineStart: 2, lineEnd: 2, offsetTop: 1000, actualTop: 1000, height: 1000 }),
      createElement({ tagName: 'p', lineStart: 3, lineEnd: 3, offsetTop: 2000, actualTop: 2000, height: 1000 }),
      createElement({ tagName: 'p', lineStart: 4, lineEnd: 4, offsetTop: 3000, actualTop: 3000, height: 1000 }),
    ])

    const { syncPreviewToEditor, clearScrollTimer } = usePreviewSync({
      editorViewRef: { value: editorView },
      previewRef: { value: previewElement },
      scrolling: { value: { editor: false, preview: false } },
      editorScrollTop: { value: 0 },
    })

    try {
      previewElement.scrollTop = 1000
      syncPreviewToEditor()
      scheduler.advanceBy(60)

      previewElement.scrollTop = 2000
      syncPreviewToEditor()
      scheduler.advanceBy(60)

      previewElement.scrollTop = 3000
      syncPreviewToEditor()
      scheduler.advanceBy(120)

      assert.equal(
        editorView.scrollDOM.scrollTop,
        3000,
        '预览已经滚到最终目标后，编辑区应直接跟上最新位置，而不是继续被早期 smooth 动画拖住',
      )
    } finally {
      clearScrollTimer()
    }
  } finally {
    scheduler.restore()
  }
})
