import assert from 'node:assert/strict'

import {
  createPreviewLayoutIndex,
  findPreviewElementAtScrollTop,
  findPreviewElementByLine,
} from '../previewLayoutIndexUtil.js'

const { test } = await import('node:test')

function createRootElement({ top = 0, clientTop = 0, scrollTop = 0, children = [] } = {}) {
  const rootElement = {
    clientTop,
    scrollTop,
    parentElement: null,
    children: [],
    contains(target) {
      let current = target
      while (current) {
        if (current === this) {
          return true
        }
        current = current.parentElement ?? null
      }
      return false
    },
    getBoundingClientRect() {
      return { top }
    },
    querySelectorAll(selector) {
      if (selector !== '[data-line-start]') {
        return []
      }
      const result = []
      const visit = (nodes) => {
        for (const node of nodes) {
          if (node?.dataset?.lineStart !== undefined) {
            result.push(node)
          }
          visit(node.children ?? [])
        }
      }
      visit(this.children)
      return result
    },
  }
  rootElement.children = children
  linkParent(rootElement, children)
  return rootElement
}

function createPreviewElement({
  id,
  lineStart,
  lineEnd = lineStart,
  top = 0,
  height = 20,
  children = [],
  isConnected = true,
  accessLog,
} = {}) {
  return {
    id,
    dataset: {
      lineStart: String(lineStart),
      lineEnd: String(lineEnd),
    },
    isConnected,
    parentElement: null,
    children,
    getBoundingClientRect() {
      accessLog?.push(id)
      return {
        top,
        height,
      }
    },
  }
}

function linkParent(parentElement, children) {
  for (const child of children) {
    child.parentElement = parentElement
    linkParent(child, child.children ?? [])
  }
}

function detachElement(element) {
  const parentElement = element.parentElement
  if (!parentElement) {
    return
  }
  parentElement.children = (parentElement.children ?? []).filter(child => child !== element)
  element.parentElement = null
}

test('同行多候选节点时，应优先选择跨度更小且层级更深的节点', () => {
  const bestMatchElement = createPreviewElement({
    id: 'best-match',
    lineStart: 2,
    lineEnd: 3,
  })
  const rootElement = createRootElement({
    children: [
      createPreviewElement({
        id: 'wide-range',
        lineStart: 1,
        lineEnd: 8,
      }),
      createPreviewElement({
        id: 'same-range-parent',
        lineStart: 2,
        lineEnd: 3,
        children: [bestMatchElement],
      }),
    ],
  })
  const index = createPreviewLayoutIndex()
  index.rebuild(rootElement)

  const result = index.findByLine(2, 8)

  assert.equal(result.found, true)
  assert.equal(result.index >= 0, true)
  assert.equal(result.matchedLineNumber, 2)
  assert.equal(result.entry?.element, bestMatchElement)
  assert.equal(result.entry?.lineStart, 2)
  assert.equal(result.entry?.lineEnd, 3)
  assert.equal(result.entry?.span, 1)
  assert.equal(result.entry?.depth, 2)
})

test('当前行无节点时，应向后寻找最近可映射行并标记 found 为 false', () => {
  const nearestElement = createPreviewElement({
    id: 'line-5',
    lineStart: 5,
    lineEnd: 5,
  })
  const rootElement = createRootElement({
    children: [nearestElement],
  })
  const index = createPreviewLayoutIndex()
  index.rebuild(rootElement)

  const result = index.findByLine(3, 8)

  assert.equal(result.found, false)
  assert.equal(result.matchedLineNumber, 5)
  assert.equal(result.entry?.element, nearestElement)
  assert.equal(result.entry?.lineStart, 5)
  assert.equal(result.entry?.lineEnd, 5)
})

test('空索引与非法输入时，应安全返回空结果', () => {
  const index = createPreviewLayoutIndex()

  assert.equal(index.hasEntries(), false)
  assert.deepEqual(index.findByLine(1, 1), {
    entry: null,
    found: false,
    index: -1,
    matchedLineNumber: null,
  })
  assert.deepEqual(index.findByLine(Number.NaN, 3), {
    entry: null,
    found: false,
    index: -1,
    matchedLineNumber: null,
  })
  assert.deepEqual(index.findAtScrollTop(20), {
    entry: null,
    index: -1,
  })
  assert.deepEqual(findPreviewElementByLine({
    rootElement: null,
    previewLayoutIndex: index,
    lineNumber: 1,
    maxLineNumber: 3,
  }), {
    entry: null,
    found: false,
    index: -1,
    matchedLineNumber: null,
    source: null,
  })
  assert.deepEqual(findPreviewElementAtScrollTop({
    rootElement: null,
    previewLayoutIndex: index,
    scrollTop: 20,
  }), {
    entry: null,
    index: -1,
    source: null,
  })
})

test('索引条目失效时，应因 isConnected 为 false 回退到 legacy DOM 查找', () => {
  const staleElement = createPreviewElement({
    id: 'stale',
    lineStart: 3,
    lineEnd: 3,
    isConnected: false,
  })
  const fallbackElement = createPreviewElement({
    id: 'fallback',
    lineStart: 3,
    lineEnd: 3,
  })
  const rootElement = createRootElement({
    children: [staleElement, fallbackElement],
  })
  const index = createPreviewLayoutIndex()
  index.rebuild(rootElement)

  const result = findPreviewElementByLine({
    rootElement,
    previewLayoutIndex: index,
    lineNumber: 3,
    maxLineNumber: 6,
  })

  assert.equal(result.source, 'legacy-dom')
  assert.equal(result.found, true)
  assert.equal(result.matchedLineNumber, 3)
  assert.equal(result.entry?.element, fallbackElement)
  assert.equal(result.entry?.order, 1)
})

test('索引条目失效时，应因 root.contains 失败回退到 legacy DOM 查找', () => {
  const removedElement = createPreviewElement({
    id: 'removed',
    lineStart: 4,
    lineEnd: 4,
  })
  const fallbackElement = createPreviewElement({
    id: 'fallback',
    lineStart: 4,
    lineEnd: 4,
  })
  const rootElement = createRootElement({
    children: [removedElement, fallbackElement],
  })
  const index = createPreviewLayoutIndex()
  index.rebuild(rootElement)
  detachElement(removedElement)

  const result = findPreviewElementByLine({
    rootElement,
    previewLayoutIndex: index,
    lineNumber: 4,
    maxLineNumber: 6,
  })

  assert.equal(result.source, 'legacy-dom')
  assert.equal(result.matchedLineNumber, 4)
  assert.equal(result.entry?.element, fallbackElement)
  assert.equal(result.entry?.order, 0)
})

test('索引条目失效时，应因 dataset 行范围变化回退到 legacy DOM 查找', () => {
  const staleElement = createPreviewElement({
    id: 'stale',
    lineStart: 6,
    lineEnd: 6,
  })
  const fallbackElement = createPreviewElement({
    id: 'fallback',
    lineStart: 6,
    lineEnd: 6,
  })
  const rootElement = createRootElement({
    children: [staleElement, fallbackElement],
  })
  const index = createPreviewLayoutIndex()
  index.rebuild(rootElement)
  staleElement.dataset.lineStart = '10'
  staleElement.dataset.lineEnd = '12'

  const result = findPreviewElementByLine({
    rootElement,
    previewLayoutIndex: index,
    lineNumber: 6,
    maxLineNumber: 12,
  })

  assert.equal(result.source, 'legacy-dom')
  assert.equal(result.matchedLineNumber, 6)
  assert.equal(result.entry?.element, fallbackElement)
})

test('按滚动位置查找时，应返回 entry/index/source 且不暴露 found 字段', () => {
  const rootElement = createRootElement({
    scrollTop: 30,
    children: [
      createPreviewElement({
        id: 'line-1',
        lineStart: 1,
        lineEnd: 1,
        top: 10,
      }),
      createPreviewElement({
        id: 'line-3',
        lineStart: 3,
        lineEnd: 4,
        top: 40,
      }),
    ],
  })
  const index = createPreviewLayoutIndex()
  index.rebuild(rootElement)

  const result = findPreviewElementAtScrollTop({
    rootElement,
    index,
    scrollTop: 35,
  })

  assert.equal(result.source, 'index')
  assert.equal(result.index >= 0, true)
  assert.equal(result.entry?.lineStart, 1)
  assert.equal(result.entry?.lineEnd, 1)
  assert.equal('found' in result, false)
})

test('legacy DOM 回退命中后，entry 仍应返回统一 shape', () => {
  const deepElement = createPreviewElement({
    id: 'deep',
    lineStart: 7,
    lineEnd: 8,
  })
  const rootElement = createRootElement({
    children: [
      createPreviewElement({
        id: 'parent',
        lineStart: 7,
        lineEnd: 8,
        children: [deepElement],
      }),
    ],
  })

  const result = findPreviewElementByLine({
    rootElement,
    lineNumber: 7,
    maxLineNumber: 10,
  })

  assert.equal(result.source, 'legacy-dom')
  assert.equal(result.matchedLineNumber, 7)
  assert.equal(result.entry?.element, deepElement)
  assert.equal(result.entry?.lineStart, 7)
  assert.equal(result.entry?.lineEnd, 8)
  assert.equal(result.entry?.depth, 2)
  assert.equal(result.entry?.span, 1)
  assert.equal(result.entry?.order, 1)
})

test('shared helper 在 index 路径下应通过 previewLayoutIndex 返回 matchedLineNumber', () => {
  const rootElement = createRootElement({
    children: [
      createPreviewElement({
        id: 'line-4',
        lineStart: 4,
        lineEnd: 6,
      }),
    ],
  })
  const previewLayoutIndex = createPreviewLayoutIndex()
  previewLayoutIndex.rebuild(rootElement)

  const result = findPreviewElementByLine({
    rootElement,
    previewLayoutIndex,
    lineNumber: 4,
    maxLineNumber: 10,
  })

  assert.equal(result.source, 'index')
  assert.equal(result.found, true)
  assert.equal(result.matchedLineNumber, 4)
  assert.equal(result.entry?.lineStart, 4)
  assert.equal(result.entry?.lineEnd, 6)
})

test('shared helper 空结果时应返回 matchedLineNumber 为 null', () => {
  const rootElement = createRootElement()
  const previewLayoutIndex = createPreviewLayoutIndex()
  previewLayoutIndex.rebuild(rootElement)

  const result = findPreviewElementByLine({
    rootElement,
    previewLayoutIndex,
    lineNumber: 2,
    maxLineNumber: 5,
  })

  assert.deepEqual(result, {
    entry: null,
    found: false,
    index: -1,
    matchedLineNumber: null,
    source: null,
  })
})

test('同 top 的嵌套节点中，应选择 DOM 顺序里最后一个有效节点', () => {
  const childElement = createPreviewElement({
    id: 'child',
    lineStart: 2,
    lineEnd: 2,
    top: 20,
  })
  const rootElement = createRootElement({
    children: [
      createPreviewElement({
        id: 'parent',
        lineStart: 1,
        lineEnd: 3,
        top: 20,
        children: [childElement],
      }),
    ],
  })
  const index = createPreviewLayoutIndex()
  index.rebuild(rootElement)

  const result = findPreviewElementAtScrollTop({
    rootElement,
    previewLayoutIndex: index,
    scrollTop: 20,
  })

  assert.equal(result.entry?.element, childElement)
  assert.equal(result.entry?.order, 1)
})

test('按滚动位置查找时，应先尝试 hint，必要时再回退完整扫描', () => {
  const accessLog = []
  const rootElement = createRootElement({
    children: [
      createPreviewElement({
        id: 'first',
        lineStart: 1,
        lineEnd: 1,
        top: 10,
        accessLog,
      }),
      createPreviewElement({
        id: 'hinted',
        lineStart: 2,
        lineEnd: 2,
        top: 70,
        accessLog,
      }),
      createPreviewElement({
        id: 'later-smaller',
        lineStart: 3,
        lineEnd: 3,
        top: 60,
        accessLog,
      }),
    ],
  })
  const index = createPreviewLayoutIndex()
  index.rebuild(rootElement)

  const result = findPreviewElementAtScrollTop({
    rootElement,
    previewLayoutIndex: index,
    scrollTop: 65,
    hint: 1,
  })

  assert.equal(result.entry?.lineStart, 3)
  assert.equal(accessLog[0], 'hinted')
  assert.equal(accessLog.includes('first'), true)
  assert.equal(accessLog.includes('later-smaller'), true)
})

test('更远后继出现乱序时，hint 路径仍应回退完整扫描', () => {
  const accessLog = []
  const rootElement = createRootElement({
    children: [
      createPreviewElement({
        id: 'first',
        lineStart: 1,
        lineEnd: 1,
        top: 10,
        accessLog,
      }),
      createPreviewElement({
        id: 'hinted',
        lineStart: 2,
        lineEnd: 2,
        top: 70,
        accessLog,
      }),
      createPreviewElement({
        id: 'next-higher',
        lineStart: 3,
        lineEnd: 3,
        top: 80,
        accessLog,
      }),
      createPreviewElement({
        id: 'far-late',
        lineStart: 4,
        lineEnd: 4,
        top: 65,
        accessLog,
      }),
    ],
  })
  const index = createPreviewLayoutIndex()
  index.rebuild(rootElement)

  const result = findPreviewElementAtScrollTop({
    rootElement,
    previewLayoutIndex: index,
    scrollTop: 68,
    hint: 1,
  })

  assert.equal(result.entry?.lineStart, 4)
  assert.equal(accessLog[0], 'hinted')
  assert.equal(accessLog.includes('first'), true)
  assert.equal(accessLog.includes('far-late'), true)
})

test('clear 应清空索引并让 hasEntries 返回 false', () => {
  const rootElement = createRootElement({
    children: [
      createPreviewElement({
        id: 'line-1',
        lineStart: 1,
        lineEnd: 1,
      }),
    ],
  })
  const index = createPreviewLayoutIndex()
  index.rebuild(rootElement)

  assert.equal(index.hasEntries(), true)
  index.clear()

  assert.equal(index.hasEntries(), false)
  assert.deepEqual(index.findByLine(1, 1), {
    entry: null,
    found: false,
    index: -1,
    matchedLineNumber: null,
  })
})
