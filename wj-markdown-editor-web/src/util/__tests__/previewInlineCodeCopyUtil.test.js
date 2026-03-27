import assert from 'node:assert/strict'

const { test } = await import('node:test')

let previewInlineCodeCopyUtilModule = null

try {
  previewInlineCodeCopyUtilModule = await import('../previewInlineCodeCopyUtil.js')
} catch {
  previewInlineCodeCopyUtilModule = null
}

function requirePreviewInlineCodeCopyUtil() {
  assert.ok(previewInlineCodeCopyUtilModule, '缺少 preview inline code copy util 模块')

  const {
    copyTextWithFeedback,
    getPreviewInlineCodeCopyText,
    hasExpandedTextSelection,
    resolvePreviewInlineCodeElement,
  } = previewInlineCodeCopyUtilModule

  assert.equal(typeof copyTextWithFeedback, 'function')
  assert.equal(typeof getPreviewInlineCodeCopyText, 'function')
  assert.equal(typeof hasExpandedTextSelection, 'function')
  assert.equal(typeof resolvePreviewInlineCodeElement, 'function')

  return {
    copyTextWithFeedback,
    getPreviewInlineCodeCopyText,
    hasExpandedTextSelection,
    resolvePreviewInlineCodeElement,
  }
}

function createInlineCodeDomStub({ text = 'const answer = 42', insideLink = false, insidePre = false } = {}) {
  const linkNode = insideLink ? { tagName: 'A' } : null
  const preNode = insidePre ? { tagName: 'PRE' } : null
  const inlineCodeNode = {
    tagName: 'CODE',
    textContent: text,
    closest(selector) {
      if (selector === 'code, tt, samp') {
        return inlineCodeNode
      }
      if (selector === 'a[href]') {
        return linkNode
      }
      if (selector === 'pre') {
        return preNode
      }
      return null
    },
  }
  const childNode = {
    closest(selector) {
      if (selector === 'code, tt, samp') {
        return inlineCodeNode
      }
      return null
    },
  }

  return {
    childNode,
    inlineCodeNode,
  }
}

test('存在非折叠文本选区时必须视为用户正在选择文本', () => {
  const { hasExpandedTextSelection } = requirePreviewInlineCodeCopyUtil()

  assert.equal(hasExpandedTextSelection(null), false)
  assert.equal(hasExpandedTextSelection({ isCollapsed: true, toString: () => 'abc' }), false)
  assert.equal(hasExpandedTextSelection({ isCollapsed: false, toString: () => '' }), false)
  assert.equal(hasExpandedTextSelection({ isCollapsed: false, toString: () => 'abc' }), true)
})

test('点击普通行内代码时必须命中可复制节点', () => {
  const { resolvePreviewInlineCodeElement, getPreviewInlineCodeCopyText } = requirePreviewInlineCodeCopyUtil()
  const { childNode, inlineCodeNode } = createInlineCodeDomStub()

  assert.equal(resolvePreviewInlineCodeElement(childNode), inlineCodeNode)
  assert.equal(getPreviewInlineCodeCopyText({
    enabled: true,
    target: childNode,
    selection: { isCollapsed: true, toString: () => '' },
  }), 'const answer = 42')
})

test('位于链接内或代码块内的 code 不得触发行内复制', () => {
  const { getPreviewInlineCodeCopyText } = requirePreviewInlineCodeCopyUtil()
  const { childNode: linkChildNode } = createInlineCodeDomStub({ insideLink: true })
  const { childNode: preChildNode } = createInlineCodeDomStub({ insidePre: true })

  assert.equal(getPreviewInlineCodeCopyText({
    enabled: true,
    target: linkChildNode,
    selection: { isCollapsed: true, toString: () => '' },
  }), null)
  assert.equal(getPreviewInlineCodeCopyText({
    enabled: true,
    target: preChildNode,
    selection: { isCollapsed: true, toString: () => '' },
  }), null)
})

test('开关关闭或存在文本选区时不得返回复制文本', () => {
  const { childNode } = createInlineCodeDomStub()
  const { getPreviewInlineCodeCopyText } = requirePreviewInlineCodeCopyUtil()

  assert.equal(getPreviewInlineCodeCopyText({
    enabled: false,
    target: childNode,
    selection: { isCollapsed: true, toString: () => '' },
  }), null)
  assert.equal(getPreviewInlineCodeCopyText({
    enabled: true,
    target: childNode,
    selection: { isCollapsed: false, toString: () => 'const' },
  }), null)
})

test('复制文本工具必须区分空内容、成功与失败三种结果', async () => {
  const { copyTextWithFeedback } = requirePreviewInlineCodeCopyUtil()
  const callOrder = []

  const emptyResult = await copyTextWithFeedback({
    text: '',
    writeText: async () => {},
    onEmpty() {
      callOrder.push('empty')
    },
    onSuccess() {
      callOrder.push('success')
    },
    onError() {
      callOrder.push('error')
    },
  })
  const successResult = await copyTextWithFeedback({
    text: 'demo',
    writeText: async () => {
      callOrder.push('write-success')
    },
    onEmpty() {
      callOrder.push('empty-2')
    },
    onSuccess() {
      callOrder.push('success')
    },
    onError() {
      callOrder.push('error-2')
    },
  })
  const failedResult = await copyTextWithFeedback({
    text: 'demo',
    writeText: async () => {
      throw new Error('write failed')
    },
    onEmpty() {
      callOrder.push('empty-3')
    },
    onSuccess() {
      callOrder.push('success-2')
    },
    onError() {
      callOrder.push('error')
    },
  })

  assert.deepEqual(callOrder, [
    'empty',
    'write-success',
    'success',
    'error',
  ])
  assert.deepEqual(emptyResult, {
    ok: false,
    reason: 'empty',
  })
  assert.deepEqual(successResult, {
    ok: true,
  })
  assert.deepEqual(failedResult, {
    ok: false,
    reason: 'write-failed',
  })
})
