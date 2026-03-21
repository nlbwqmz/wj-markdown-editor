import assert from 'node:assert/strict'

const { test } = await import('node:test')

let markdownEditPreviewLayoutIndexWiringModule = null

try {
  markdownEditPreviewLayoutIndexWiringModule = await import('../markdownEditPreviewLayoutIndexWiring.js')
} catch {
  markdownEditPreviewLayoutIndexWiringModule = null
}

/**
 * 统一校验编辑页预览索引接线模块已经存在。
 * RED 阶段模块缺失时会直接失败在这里，方便定位缺失实现。
 *
 * @returns {Function} 返回待测的 createMarkdownEditPreviewLayoutIndexWiring 工厂函数。
 */
function requireCreateMarkdownEditPreviewLayoutIndexWiring() {
  assert.ok(markdownEditPreviewLayoutIndexWiringModule, '缺少 markdown edit preview layout index wiring 模块')

  const { createMarkdownEditPreviewLayoutIndexWiring } = markdownEditPreviewLayoutIndexWiringModule
  assert.equal(typeof createMarkdownEditPreviewLayoutIndexWiring, 'function')

  return createMarkdownEditPreviewLayoutIndexWiring
}

function createPreviewRoot(lineStart) {
  let previewBlock = null
  const rootElement = {
    scrollTop: 0,
    clientTop: 0,
    contains(target) {
      return target === previewBlock
    },
    getBoundingClientRect() {
      return { top: 0 }
    },
    querySelectorAll(selector) {
      if (selector !== '[data-line-start]') {
        return []
      }
      return [previewBlock]
    },
  }

  previewBlock = {
    dataset: {
      lineStart: String(lineStart),
      lineEnd: String(lineStart),
    },
    isConnected: true,
    parentElement: rootElement,
    getBoundingClientRect() {
      return {
        top: 40,
        height: 20,
      }
    },
  }

  return {
    rootElement,
    previewBlock,
  }
}

function createPreviewRefWithReadTracker(initialRootElement) {
  let currentRootElement = initialRootElement
  let readCount = 0

  return {
    get readCount() {
      return readCount
    },
    get value() {
      readCount++
      return currentRootElement
    },
    set value(nextRootElement) {
      currentRootElement = nextRootElement
    },
  }
}

test('会创建同一个 previewLayoutIndex 实例并同时注入 usePreviewSync 与 useAssociationHighlight', () => {
  const createMarkdownEditPreviewLayoutIndexWiring = requireCreateMarkdownEditPreviewLayoutIndexWiring()
  const { rootElement } = createPreviewRoot(3)
  const previewRef = createPreviewRefWithReadTracker(rootElement)
  const previewSyncResult = { source: 'preview-sync' }
  const associationHighlightResult = { source: 'association-highlight' }
  let previewSyncOptions = null
  let associationHighlightOptions = null

  const wiringResult = createMarkdownEditPreviewLayoutIndexWiring({
    previewRef,
    usePreviewSync(options) {
      previewSyncOptions = options
      return previewSyncResult
    },
    previewSyncOptions: {
      editorViewRef: { value: null },
    },
    useAssociationHighlight(options) {
      associationHighlightOptions = options
      return associationHighlightResult
    },
    associationHighlightOptions: {
      editorViewRef: { value: null },
    },
  })

  assert.equal(previewSyncOptions.previewLayoutIndex, wiringResult.previewLayoutIndex)
  assert.equal(associationHighlightOptions.previewLayoutIndex, wiringResult.previewLayoutIndex)
  assert.equal(wiringResult.previewSync, previewSyncResult)
  assert.equal(wiringResult.associationHighlight, associationHighlightResult)
})

test('rebuildPreviewLayoutIndex 调用时会读取 previewRef.value，并按当前 preview root 重建索引', () => {
  const createMarkdownEditPreviewLayoutIndexWiring = requireCreateMarkdownEditPreviewLayoutIndexWiring()
  const firstPreview = createPreviewRoot(3)
  const secondPreview = createPreviewRoot(9)
  const previewRef = createPreviewRefWithReadTracker(firstPreview.rootElement)

  const wiringResult = createMarkdownEditPreviewLayoutIndexWiring({
    previewRef,
    usePreviewSync: () => ({}),
    previewSyncOptions: {},
    useAssociationHighlight: () => ({}),
    associationHighlightOptions: {},
  })

  assert.equal(previewRef.readCount, 0)

  wiringResult.rebuildPreviewLayoutIndex()
  const firstLookup = wiringResult.previewLayoutIndex.findByLine(3, 3)

  previewRef.value = secondPreview.rootElement
  wiringResult.rebuildPreviewLayoutIndex()
  const secondLookup = wiringResult.previewLayoutIndex.findByLine(9, 9)
  const staleLookup = wiringResult.previewLayoutIndex.findByLine(3, 3)

  assert.equal(previewRef.readCount, 2)
  assert.equal(firstLookup.entry?.element, firstPreview.previewBlock)
  assert.equal(secondLookup.entry?.element, secondPreview.previewBlock)
  assert.equal(staleLookup.entry, null)
})

test('第一阶段 wiring helper 只负责索引接线，不接管 legacy 预览锚点 capture 或 restore', () => {
  const createMarkdownEditPreviewLayoutIndexWiring = requireCreateMarkdownEditPreviewLayoutIndexWiring()
  const { rootElement } = createPreviewRoot(5)
  const previewRef = createPreviewRefWithReadTracker(rootElement)
  let previewSyncOptions = null
  let associationHighlightOptions = null

  const wiringResult = createMarkdownEditPreviewLayoutIndexWiring({
    previewRef,
    usePreviewSync(options) {
      previewSyncOptions = options
      return {}
    },
    previewSyncOptions: {
      editorViewRef: { value: null },
    },
    useAssociationHighlight(options) {
      associationHighlightOptions = options
      return {}
    },
    associationHighlightOptions: {
      editorViewRef: { value: null },
    },
  })

  assert.equal('findPreviewElementByLine' in wiringResult, false)
  assert.equal('findPreviewElementAtScrollTop' in wiringResult, false)
  assert.equal('findPreviewElementByAnchor' in wiringResult, false)
  assert.equal('captureViewScrollAnchors' in wiringResult, false)
  assert.equal('scheduleRestoreForCurrentSnapshot' in wiringResult, false)
  assert.equal(previewSyncOptions.findPreviewElementByLine, undefined)
  assert.equal(previewSyncOptions.findPreviewElementAtScrollTop, undefined)
  assert.equal(previewSyncOptions.findPreviewElementByAnchor, undefined)
  assert.equal(associationHighlightOptions.findPreviewElementByLine, undefined)
  assert.equal(associationHighlightOptions.findPreviewElementAtScrollTop, undefined)
  assert.equal(associationHighlightOptions.findPreviewElementByAnchor, undefined)
})
