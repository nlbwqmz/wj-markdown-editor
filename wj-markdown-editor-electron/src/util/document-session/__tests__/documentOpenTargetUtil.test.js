import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isMarkdownFilePath, resolveDocumentOpenPath } from '../documentOpenTargetUtil.js'

describe('documentOpenTargetUtil', () => {
  it('isMarkdownFilePath 必须按大小写不敏感方式识别 .md / .markdown 后缀', () => {
    expect(isMarkdownFilePath('C:/docs/readme.md')).toBe(true)
    expect(isMarkdownFilePath('C:/docs/README.MD')).toBe(true)
    expect(isMarkdownFilePath('C:/docs/note.Md')).toBe(true)
    expect(isMarkdownFilePath('C:/docs/readme.markdown')).toBe(true)
    expect(isMarkdownFilePath('C:/docs/README.MARKDOWN')).toBe(true)
    expect(isMarkdownFilePath('C:/docs/plain.txt')).toBe(false)
    expect(isMarkdownFilePath('C:/docs/folder.md/')).toBe(false)
    expect(isMarkdownFilePath('C:/docs/folder.markdown/')).toBe(false)
  })

  it('resolveDocumentOpenPath 必须把相对路径按给定工作目录解析成稳定的绝对路径', () => {
    const resolvedPath = resolveDocumentOpenPath('docs/demo.md', {
      baseDir: path.resolve('workspace-root'),
    })

    expect(resolvedPath).toBe(path.resolve('workspace-root', 'docs/demo.md').replaceAll('\\', '/'))
  })
})
