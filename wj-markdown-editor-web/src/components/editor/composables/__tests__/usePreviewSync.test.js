import assert from 'node:assert/strict'
import { usePreviewSync } from '../usePreviewSync.js'

const { test } = await import('node:test')

const previewElement = {
  scrollTop: 0,
  scrollHeight: 2000,
  clientHeight: 300,
  clientTop: 0,
  getBoundingClientRect() {
    return {
      top: 0,
    }
  },
  querySelectorAll() {
    return []
  },
}

function createElement({
  tagName = 'div',
  lineStart,
  lineEnd,
  offsetTop,
  actualTop,
  height,
}) {
  return {
    tagName: tagName.toUpperCase(),
    dataset: {
      lineStart: String(lineStart),
      lineEnd: String(lineEnd),
    },
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
        line(lineNumber) {
          return { from: lineNumber * 10 }
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
  previewElement.querySelectorAll = () => elements
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
  previewElement.querySelectorAll = () => elements
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
