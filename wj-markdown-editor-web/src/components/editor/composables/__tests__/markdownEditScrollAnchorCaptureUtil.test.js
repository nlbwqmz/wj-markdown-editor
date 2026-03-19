import assert from 'node:assert/strict'
import { ref } from 'vue'

import { resolvePreviewLineAnchorScrollTop } from '../../../../util/editor/viewScrollAnchorMathUtil.js'
import {
  createViewScrollAnchorSessionStore,
  getAnchorRecord,
  saveAnchorRecord,
} from '../../../../util/editor/viewScrollAnchorSessionUtil.js'
import { useViewScrollAnchor } from '../useViewScrollAnchor.js'

const { test } = await import('node:test')

let markdownEditScrollAnchorCaptureUtilModule = null

try {
  markdownEditScrollAnchorCaptureUtilModule = await import('../markdownEditScrollAnchorCaptureUtil.js')
} catch {
  markdownEditScrollAnchorCaptureUtilModule = null
}

/**
 * 统一断言组件侧 capture wiring 工具已经存在。
 * 红灯阶段缺少模块时，测试会稳定失败在这里，方便直接定位到缺失的能力。
 *
 * @returns {Function} 返回待测的 createMarkdownEditScrollAnchorCapture 工厂函数。
 */
function requireCreateMarkdownEditScrollAnchorCapture() {
  assert.ok(markdownEditScrollAnchorCaptureUtilModule, '缺少 markdown edit scroll anchor capture util')

  const { createMarkdownEditScrollAnchorCapture } = markdownEditScrollAnchorCaptureUtilModule
  assert.equal(typeof createMarkdownEditScrollAnchorCapture, 'function')

  return createMarkdownEditScrollAnchorCapture
}

/**
 * 统一断言组件侧 preview restore wiring 工具已经存在。
 * 红灯阶段若导出缺失，测试会直接失败在这里，避免把问题误报成底层 store 或数学工具异常。
 *
 * @returns {Function} 返回待测的 createMarkdownEditPreviewScrollAnchorRestore 工厂函数。
 */
function requireCreateMarkdownEditPreviewScrollAnchorRestore() {
  assert.ok(markdownEditScrollAnchorCaptureUtilModule, '缺少 markdown edit scroll anchor capture util')

  const { createMarkdownEditPreviewScrollAnchorRestore } = markdownEditScrollAnchorCaptureUtilModule
  assert.equal(typeof createMarkdownEditPreviewScrollAnchorRestore, 'function')

  return createMarkdownEditPreviewScrollAnchorRestore
}

/**
 * 创建当前快照引用，模拟组件内部维护的 sessionId + revision。
 *
 * @returns {import('vue').Ref<{ sessionId: string, revision: number }>} 返回模拟组件内部快照状态的 ref。
 */
function createSnapshotRef() {
  return ref({
    sessionId: 'session-1',
    revision: 7,
  })
}

/**
 * 组装最小编辑区锚点控制器。
 * 这里继续复用真实的 useViewScrollAnchor，确保测试覆盖到组件 wiring 与底层 store 的协作。
 *
 * @param {{
 *   store: Record<string, Record<string, any>>,
 *   snapshotRef: import('vue').Ref<{ sessionId: string, revision: number }>,
 *   captureCalls: number[],
 * }} options
 * @returns {ReturnType<typeof useViewScrollAnchor>} 返回编辑区滚动锚点控制器。
 */
function createEditorCodeScrollAnchor(options) {
  const scrollElement = { scrollTop: 145 }

  return useViewScrollAnchor({
    store: options.store,
    sessionIdGetter: () => options.snapshotRef.value.sessionId,
    revisionGetter: () => options.snapshotRef.value.revision,
    scrollAreaKey: 'editor-code',
    getScrollElement: () => scrollElement,
    captureAnchor: () => {
      options.captureCalls.push(scrollElement.scrollTop)
      return {
        type: 'editor-line',
        lineNumber: 15,
        lineOffsetRatio: 0.45,
      }
    },
    restoreAnchor: () => true,
  })
}

/**
 * 组装最小预览区锚点控制器。
 * 这里故意把 capture 调用次数暴露出来，便于验证“预览隐藏时组件侧根本不会触发预览采集”。
 *
 * @param {{
 *   store: Record<string, Record<string, any>>,
 *   snapshotRef: import('vue').Ref<{ sessionId: string, revision: number }>,
 *   captureCalls: number[],
 * }} options
 * @returns {ReturnType<typeof useViewScrollAnchor>} 返回预览区滚动锚点控制器。
 */
function createEditorPreviewScrollAnchor(options) {
  const scrollElement = { scrollTop: 280 }

  return useViewScrollAnchor({
    store: options.store,
    sessionIdGetter: () => options.snapshotRef.value.sessionId,
    revisionGetter: () => options.snapshotRef.value.revision,
    scrollAreaKey: 'editor-preview',
    getScrollElement: () => scrollElement,
    captureAnchor: () => {
      options.captureCalls.push(scrollElement.scrollTop)
      return {
        type: 'preview-line',
        lineStart: 28,
        lineEnd: 30,
        elementOffsetRatio: 0.8,
      }
    },
    restoreAnchor: () => true,
  })
}

/**
 * 创建最小预览滚动容器。
 * 这里保留 scrollTo 轨迹，便于断言 restore wiring 是否真正把 fallbackScrollTop 应用到了容器上。
 *
 * @returns {{
 *   scrollTop: number,
 *   scrollToCalls: number[],
 *   scrollTo: ({ top }: { top: number }) => void,
 * }} 返回带有滚动轨迹记录能力的最小滚动容器。
 */
function createPreviewScrollElement() {
  return {
    scrollTop: 0,
    scrollToCalls: [],
    scrollTo({ top }) {
      this.scrollTop = top
      this.scrollToCalls.push(top)
    },
  }
}

test('组件侧 captureViewScrollAnchors 在右侧预览隐藏时只更新 editor-code，并保留已有 editor-preview 记录', () => {
  const createMarkdownEditScrollAnchorCapture = requireCreateMarkdownEditScrollAnchorCapture()
  const store = createViewScrollAnchorSessionStore()
  const snapshotRef = createSnapshotRef()
  const editorCodeCaptureCalls = []
  const editorPreviewCaptureCalls = []
  const previewControllerRef = ref(false)

  const previousPreviewRecord = saveAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-preview',
    revision: 7,
    anchor: {
      type: 'preview-line',
      lineStart: 10,
      lineEnd: 12,
      elementOffsetRatio: 0.25,
    },
    fallbackScrollTop: 120,
    savedAt: 1,
  })

  const editorCodeScrollAnchor = createEditorCodeScrollAnchor({
    store,
    snapshotRef,
    captureCalls: editorCodeCaptureCalls,
  })
  const editorPreviewScrollAnchor = createEditorPreviewScrollAnchor({
    store,
    snapshotRef,
    captureCalls: editorPreviewCaptureCalls,
  })

  const captureViewScrollAnchors = createMarkdownEditScrollAnchorCapture({
    updateCurrentScrollSnapshot: (snapshot) => {
      snapshotRef.value = {
        sessionId: typeof snapshot?.sessionId === 'string' ? snapshot.sessionId : '',
        revision: Number.isInteger(snapshot?.revision) ? snapshot.revision : 0,
      }
    },
    editorCodeScrollAnchor,
    editorPreviewScrollAnchor,
    previewControllerRef,
  })

  const captureResult = captureViewScrollAnchors({
    sessionId: 'session-1',
    revision: 7,
  })

  const savedEditorCodeRecord = getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-code',
  })
  const savedPreviewRecord = getAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-preview',
  })

  assert.equal(editorCodeCaptureCalls.length, 1)
  assert.equal(editorPreviewCaptureCalls.length, 0)
  assert.equal(captureResult.editorPreview, null)
  assert.deepEqual(savedEditorCodeRecord.anchor, {
    type: 'editor-line',
    lineNumber: 15,
    lineOffsetRatio: 0.45,
  })
  assert.deepEqual(savedPreviewRecord.anchor, previousPreviewRecord.anchor)
  assert.equal(savedPreviewRecord.fallbackScrollTop, previousPreviewRecord.fallbackScrollTop)
})

test('组件侧预览恢复在找不到精确锚点元素时，会回退到 fallbackScrollTop', async () => {
  const createMarkdownEditPreviewScrollAnchorRestore = requireCreateMarkdownEditPreviewScrollAnchorRestore()
  const store = createViewScrollAnchorSessionStore()
  const snapshotRef = createSnapshotRef()
  const scrollElement = createPreviewScrollElement()

  saveAnchorRecord(store, {
    sessionId: 'session-1',
    scrollAreaKey: 'editor-preview',
    revision: 7,
    anchor: {
      type: 'preview-line',
      lineStart: 20,
      lineEnd: 22,
      elementOffsetRatio: 0.6,
    },
    fallbackScrollTop: 188,
    savedAt: 1,
  })

  const editorPreviewScrollAnchor = useViewScrollAnchor({
    store,
    sessionIdGetter: () => snapshotRef.value.sessionId,
    revisionGetter: () => snapshotRef.value.revision,
    scrollAreaKey: 'editor-preview',
    getScrollElement: () => scrollElement,
    restoreAnchor: createMarkdownEditPreviewScrollAnchorRestore({
      findPreviewElementByAnchor: () => null,
      resolvePreviewLineAnchorScrollTop,
      setScrollElementScrollTop: (targetScrollElement, targetScrollTop) => {
        targetScrollElement.scrollTo({ top: targetScrollTop })
      },
    }),
    waitLayoutStable: async () => {},
  })

  const restoreResult = await editorPreviewScrollAnchor.scheduleRestoreForCurrentSnapshot()

  assert.equal(restoreResult, true)
  assert.deepEqual(scrollElement.scrollToCalls, [188])
  assert.equal(scrollElement.scrollTop, 188)
})
