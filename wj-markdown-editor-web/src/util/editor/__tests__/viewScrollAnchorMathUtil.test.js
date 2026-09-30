import assert from 'node:assert/strict'

import {
  captureEditorLineAnchor,
  capturePreviewLineAnchor,
  resolveEditorLineAnchorScrollTop,
  resolvePreviewLineAnchorScrollTop,
  resolvePreviewLineElement,
} from '../viewScrollAnchorMathUtil.js'

const { test } = await import('node:test')

/**
 * 创建最小编辑器视图桩对象。
 * 这里仅保留滚动锚点计算需要的接口，避免测试掺杂真实编辑器行为。
 */
function createEditorView({ lineBlocks }) {
  const lineBlockMap = new Map(lineBlocks.map(lineBlock => [lineBlock.lineNumber, lineBlock]))
  const fromLineNumberMap = new Map(lineBlocks.map(lineBlock => [lineBlock.from, lineBlock.lineNumber]))

  return {
    state: {
      doc: {
        /**
         * 模拟 CodeMirror 的 lineAt，通过 from 反查行号。
         */
        lineAt(from) {
          return {
            number: fromLineNumberMap.get(from),
          }
        },
        /**
         * 模拟 CodeMirror 的 line，通过行号反查 from。
         */
        line(lineNumber) {
          const lineBlock = lineBlockMap.get(lineNumber)
          if (!lineBlock) {
            /**
             * 贴近真实 CodeMirror 行为：
             * 当调用方请求越界行号时，doc.line 会直接抛出 RangeError，
             * 而不是返回 undefined。
             */
            throw new RangeError(`Invalid line number ${lineNumber}`)
          }
          return {
            from: lineBlock.from,
          }
        },
      },
    },
    /**
     * 模拟按滚动高度命中顶部可见行块。
     */
    lineBlockAtHeight(scrollTop) {
      return lineBlocks.find(lineBlock => lineBlock.top <= scrollTop && scrollTop < lineBlock.top + lineBlock.height) ?? lineBlocks.at(-1)
    },
    /**
     * 模拟按文档位置获取行块几何信息。
     */
    lineBlockAt(from) {
      const lineNumber = fromLineNumberMap.get(from)
      return lineBlockMap.get(lineNumber)
    },
  }
}

/**
 * 创建最小预览容器桩对象。
 * 预览区的坐标语义依赖容器矩形、边框宽度和当前 scrollTop。
 */
function createPreviewContainer({ top = 0, clientTop = 0, scrollTop = 0 } = {}) {
  return {
    clientTop,
    scrollTop,
    getBoundingClientRect() {
      return { top }
    },
  }
}

/**
 * 创建最小预览元素桩对象。
 * actualTop 表示元素在滚动内容中的真实顶部位置，测试里再换算成视口矩形。
 */
function createPreviewElement({
  container,
  lineStart,
  lineEnd,
  actualTop,
  height,
}) {
  return {
    dataset: {
      lineStart: String(lineStart),
      lineEnd: String(lineEnd),
    },
    getBoundingClientRect() {
      return {
        top: container.getBoundingClientRect().top + container.clientTop + actualTop - container.scrollTop,
        height,
      }
    },
  }
}

test('captureEditorLineAnchor 能从顶部行块计算行号与行内偏移比例', () => {
  const view = createEditorView({
    lineBlocks: [
      { lineNumber: 1, from: 10, top: 0, height: 40 },
      { lineNumber: 2, from: 20, top: 40, height: 40 },
      { lineNumber: 3, from: 30, top: 80, height: 40 },
    ],
  })

  const anchor = captureEditorLineAnchor({
    view,
    scrollTop: 100,
  })

  assert.deepEqual(anchor, {
    type: 'editor-line',
    lineNumber: 3,
    lineOffsetRatio: 0.5,
  })
})

test('resolveEditorLineAnchorScrollTop 能按行号与行内偏移比例还原 scrollTop', () => {
  const view = createEditorView({
    lineBlocks: [
      { lineNumber: 5, from: 50, top: 90, height: 60 },
      { lineNumber: 6, from: 60, top: 150, height: 60 },
      { lineNumber: 7, from: 70, top: 210, height: 60 },
    ],
  })

  const targetScrollTop = resolveEditorLineAnchorScrollTop({
    view,
    anchor: {
      type: 'editor-line',
      lineNumber: 6,
      lineOffsetRatio: 0.02,
    },
    fallbackScrollTop: 0,
  })

  assert.equal(targetScrollTop, 151.2)
})

test('resolveEditorLineAnchorScrollTop 在锚点行号越界时应回退 fallbackScrollTop 且不抛异常', () => {
  const view = createEditorView({
    lineBlocks: [
      { lineNumber: 5, from: 50, top: 90, height: 60 },
      { lineNumber: 6, from: 60, top: 150, height: 60 },
      { lineNumber: 7, from: 70, top: 210, height: 60 },
    ],
  })

  assert.doesNotThrow(() => {
    assert.equal(resolveEditorLineAnchorScrollTop({
      view,
      anchor: {
        type: 'editor-line',
        lineNumber: 99,
        lineOffsetRatio: 0.3,
      },
      fallbackScrollTop: 44,
    }), 44)
  })
})

test('capturePreviewLineAnchor 能记录行范围与元素内偏移比例', () => {
  const container = createPreviewContainer({
    scrollTop: 220,
  })
  const element = createPreviewElement({
    container,
    lineStart: 6,
    lineEnd: 7,
    actualTop: 218,
    height: 100,
  })

  const anchor = capturePreviewLineAnchor({
    container,
    element,
    scrollTop: 220,
  })

  assert.deepEqual(anchor, {
    type: 'preview-line',
    lineStart: 6,
    lineEnd: 7,
    elementOffsetRatio: 0.02,
  })
})

test('resolvePreviewLineAnchorScrollTop 找不到块时会回退 fallbackScrollTop', () => {
  const container = createPreviewContainer({
    scrollTop: 220,
  })

  const targetScrollTop = resolvePreviewLineAnchorScrollTop({
    container,
    element: null,
    anchor: {
      type: 'preview-line',
      lineStart: 6,
      lineEnd: 7,
      elementOffsetRatio: 0.02,
    },
    fallbackScrollTop: 88,
  })

  assert.equal(targetScrollTop, 88)
})

/**
 * 创建带行号映射的最小预览元素桩对象。
 * parentElement 用于验证嵌套深度排序。
 */
function createLineMappedElement({ lineStart, lineEnd, parentElement = null }) {
  return {
    dataset: {
      lineStart: String(lineStart),
      lineEnd: String(lineEnd),
    },
    parentElement,
  }
}

test('resolvePreviewLineElement 能命中包含目标行号且行范围最精确的元素', () => {
  const outerElement = createLineMappedElement({ lineStart: 10, lineEnd: 20 })
  const innerElement = createLineMappedElement({ lineStart: 12, lineEnd: 14 })

  assert.equal(resolvePreviewLineElement([outerElement, innerElement], 13), innerElement)
})

test('resolvePreviewLineElement 在行范围相同时应优先选择嵌套更深的元素', () => {
  const parentElement = createLineMappedElement({ lineStart: 5, lineEnd: 6 })
  const childElement = createLineMappedElement({ lineStart: 5, lineEnd: 6, parentElement })

  assert.equal(resolvePreviewLineElement([parentElement, childElement], 5), childElement)
})

test('resolvePreviewLineElement 在目标行号落在行范围边界时应命中', () => {
  const element = createLineMappedElement({ lineStart: 7, lineEnd: 9 })

  assert.equal(resolvePreviewLineElement([element], 7), element)
  assert.equal(resolvePreviewLineElement([element], 9), element)
})

test('resolvePreviewLineElement 在行号落在块间隙时应选择距离最近的块', () => {
  const previousElement = createLineMappedElement({ lineStart: 3, lineEnd: 4 })
  const nextElement = createLineMappedElement({ lineStart: 8, lineEnd: 9 })

  // 行号 6 距离上一块（lineEnd 4）为 2，距离下一块（lineStart 8）也为 2，
  // 此时按定位精度（span 更小、嵌套更深）决胜；两者精度相同则保留上一块。
  assert.equal(resolvePreviewLineElement([previousElement, nextElement], 6), previousElement)

  // 行号 7 距离下一块更近，应选择下一块。
  assert.equal(resolvePreviewLineElement([previousElement, nextElement], 7), nextElement)
})

test('resolvePreviewLineElement 在行号小于所有块时应选择首个块', () => {
  const firstElement = createLineMappedElement({ lineStart: 5, lineEnd: 6 })
  const secondElement = createLineMappedElement({ lineStart: 9, lineEnd: 10 })

  assert.equal(resolvePreviewLineElement([firstElement, secondElement], 2), firstElement)
})

test('resolvePreviewLineElement 在行号大于所有块时应选择末个块', () => {
  const firstElement = createLineMappedElement({ lineStart: 5, lineEnd: 6 })
  const secondElement = createLineMappedElement({ lineStart: 9, lineEnd: 10 })

  assert.equal(resolvePreviewLineElement([firstElement, secondElement], 42), secondElement)
})

test('resolvePreviewLineElement 遇到非法行号或空集合时应返回 null', () => {
  const element = createLineMappedElement({ lineStart: 7, lineEnd: 9 })

  assert.equal(resolvePreviewLineElement([element], 0), null)
  assert.equal(resolvePreviewLineElement([element], Number.NaN), null)
  assert.equal(resolvePreviewLineElement(null, 7), null)
})

test('resolvePreviewLineElement 应跳过缺少行号映射的元素', () => {
  const plainElement = { dataset: {}, parentElement: null }
  const mappedElement = createLineMappedElement({ lineStart: 3, lineEnd: 4 })

  assert.equal(resolvePreviewLineElement([plainElement, mappedElement], 3), mappedElement)
})
