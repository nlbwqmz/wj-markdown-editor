import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('preview theme 基础骨架必须只对 metadata 标记过的行内代码显示 pointer 手型', () => {
  const baseSource = readSource('../preview-theme/preview-theme-base.scss')
  const contractSource = readSource('../preview-theme/preview-theme-contract.scss')

  assert.match(
    baseSource,
    /:where\(\[data-wj-inline-code-copyable='true'\]:hover\)\s*\{[\s\S]*?cursor:\s*var\(--wj-preview-inline-code-copy-cursor\);/u,
  )
  assert.match(
    contractSource,
    /--wj-preview-inline-code-copy-cursor:\s*var\(--wj-preview-cursor-pointer\);/u,
  )
  assert.doesNotMatch(
    baseSource,
    /:where\(:not\(pre\)\s*>\s*code,\s*:not\(pre\)\s*>\s*tt,\s*:not\(pre\)\s*>\s*samp\)\s*\{[\s\S]*?cursor:\s*pointer;/u,
    '基础 inline code 选择器不得无条件显示手型',
  )
})
