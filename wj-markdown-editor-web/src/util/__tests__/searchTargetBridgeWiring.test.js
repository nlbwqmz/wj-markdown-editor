import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('预览页搜索接入应统一使用搜索目标桥接器', () => {
  const source = readSource('../../views/PreviewView.vue')

  assert.match(source, /import\s+\{\s*createSearchTargetBridge\s*\}\s+from\s+'@\/util\/searchTargetBridgeUtil\.js'/)
  assert.match(source, /const\s+previewSearchTargetBridge\s*=\s*createSearchTargetBridge\(/)
  assert.match(source, /previewSearchTargetBridge\.activate\(\)/)
  assert.match(source, /previewSearchTargetBridge\.deactivate\(/)
  assert.equal(source.includes('registerTargetProvider('), false)
  assert.equal(source.includes('unregisterTargetProvider('), false)
})

test('编辑页预览搜索接入应统一使用搜索目标桥接器', () => {
  const source = readSource('../../components/editor/MarkdownEdit.vue')

  assert.match(source, /import\s+\{\s*createSearchTargetBridge\s*\}\s+from\s+'@\/util\/searchTargetBridgeUtil\.js'/)
  assert.match(source, /const\s+previewSearchTargetBridge\s*=\s*createSearchTargetBridge\(/)
  assert.match(source, /previewSearchTargetBridge\.activate\(\)/)
  assert.match(source, /previewSearchTargetBridge\.deactivate\(/)
  assert.equal(source.includes('registerTargetProvider('), false)
  assert.equal(source.includes('unregisterTargetProvider('), false)
})
