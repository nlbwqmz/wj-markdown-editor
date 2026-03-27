import assert from 'node:assert/strict'

const { test } = await import('node:test')

let markdownPreviewDomPatchUtilModule = null

try {
  markdownPreviewDomPatchUtilModule = await import('../markdownPreviewDomPatchUtil.js')
} catch {
  markdownPreviewDomPatchUtilModule = null
}

function requireShouldReplaceElementBeforeAttributeSync() {
  assert.ok(markdownPreviewDomPatchUtilModule, '缺少 markdown preview dom patch util 模块')

  const { shouldReplaceElementBeforeAttributeSync } = markdownPreviewDomPatchUtilModule
  assert.equal(typeof shouldReplaceElementBeforeAttributeSync, 'function')

  return shouldReplaceElementBeforeAttributeSync
}

function createElementStub(nodeName, attributes = {}) {
  return {
    nodeType: 1,
    nodeName,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null
    },
  }
}

test('input 的 type 发生变化时，会要求在属性同步前直接替换节点', () => {
  const shouldReplaceElementBeforeAttributeSync = requireShouldReplaceElementBeforeAttributeSync()
  const oldNode = createElementStub('INPUT', {
    type: 'text',
    value: 'search keyword',
  })
  const newNode = createElementStub('INPUT', {
    type: 'number',
    value: 'search keyword',
  })

  assert.equal(shouldReplaceElementBeforeAttributeSync(oldNode, newNode), true)
})

test('input 的 type 未变化时，不会要求直接替换节点', () => {
  const shouldReplaceElementBeforeAttributeSync = requireShouldReplaceElementBeforeAttributeSync()
  const oldNode = createElementStub('INPUT', {
    type: 'number',
    value: '1',
  })
  const newNode = createElementStub('INPUT', {
    type: 'number',
    value: '2',
  })

  assert.equal(shouldReplaceElementBeforeAttributeSync(oldNode, newNode), false)
})

test('非 input 元素即使属性变化，也不会触发表单节点替换分支', () => {
  const shouldReplaceElementBeforeAttributeSync = requireShouldReplaceElementBeforeAttributeSync()
  const oldNode = createElementStub('DIV', {
    role: 'note',
  })
  const newNode = createElementStub('DIV', {
    role: 'alert',
  })

  assert.equal(shouldReplaceElementBeforeAttributeSync(oldNode, newNode), false)
})
