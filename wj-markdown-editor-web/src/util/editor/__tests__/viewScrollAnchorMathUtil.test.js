import assert from 'node:assert/strict'

import {
  captureEditorLineAnchor,
  capturePreviewLineAnchor,
  resolveEditorLineAnchorScrollTop,
  resolvePreviewLineAnchorScrollTop,
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
          return {
            from: lineBlock?.from,
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
