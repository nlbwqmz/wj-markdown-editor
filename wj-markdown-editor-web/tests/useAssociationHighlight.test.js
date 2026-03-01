import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { useAssociationHighlight } from '../src/components/editor/composables/useAssociationHighlight.js'

function mockEditorState(lineNumber) {
  return {
    doc: {
      lines: 500,
      lineAt: () => ({ number: lineNumber }),
    },
    selection: {
      main: {
        to: 1,
      },
    },
  }
}

test('highlightByEditorCursor 同一行重复触发时应只执行一次高亮同步', () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const rafQueue = []

  globalThis.requestAnimationFrame = (callback) => {
    rafQueue.push(callback)
    return rafQueue.length
  }
  globalThis.cancelAnimationFrame = (id) => {
    const index = id - 1
    if (index >= 0 && index < rafQueue.length) {
      rafQueue[index] = null
    }
  }

  try {
    const dispatchCalls = []
    const editorViewRef = ref({
      state: mockEditorState(10),
      dispatch: payload => dispatchCalls.push(payload),
    })
    const previewRef = ref(null)
    const previewController = ref(false)
    const associationHighlight = ref(true)
    const themeRef = ref('light')

    const { highlightByEditorCursor } = useAssociationHighlight({
      editorViewRef,
      previewRef,
      previewController,
      associationHighlight,
      themeRef,
      findPreviewElement: () => ({ found: false, element: null }),
    })

    highlightByEditorCursor(mockEditorState(10))
    highlightByEditorCursor(mockEditorState(10))
    highlightByEditorCursor(mockEditorState(10))

    assert.equal(dispatchCalls.length, 0)

    const callbacks = rafQueue.splice(0, rafQueue.length)
    callbacks.forEach((callback) => {
      if (callback) {
        callback()
      }
    })

    assert.equal(dispatchCalls.length, 1)
  } finally {
    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
    } else {
      delete globalThis.requestAnimationFrame
    }

    if (originalCancelAnimationFrame) {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    } else {
      delete globalThis.cancelAnimationFrame
    }
  }
})
