import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('预览组件默认主题值必须统一为 github', () => {
  const previewSource = readSource('../../../components/editor/MarkdownPreview.vue')
  const editSource = readSource('../../../components/editor/MarkdownEdit.vue')

  assert.match(previewSource, /default:\s*\(\)\s*=>\s*'github'/)
  assert.match(editSource, /default:\s*\(\)\s*=>\s*'github'/)
  assert.equal(previewSource.includes('github-light'), false)
  assert.equal(editSource.includes('github-light'), false)
})
