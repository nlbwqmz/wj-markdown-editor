import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const editorExtensionUtilPath = path.resolve(__dirname, '../../../wj-markdown-editor-web/src/util/editor/editorExtensionUtil.js')

describe('editor 搜索跳转滚动配置', () => {
  it('应该显式使用顶层 EditorView 生成搜索滚动效果', () => {
    const source = fs.readFileSync(editorExtensionUtilPath, 'utf8')

    expect(source).toMatch(/search\(\s*\{[\s\S]*scrollToMatch\s*:/)
    expect(source).toMatch(/EditorView\.scrollIntoView\(/)
  })
})
