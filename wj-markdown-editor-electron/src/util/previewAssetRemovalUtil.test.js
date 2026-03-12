import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as previewAssetRemovalUtil from '../../../wj-markdown-editor-web/src/util/editor/previewAssetRemovalUtil.js'

const {
  countRemainingAssetReferences,
  removeAllAssetReferencesFromMarkdown,
  removeAssetFromMarkdown,
} = previewAssetRemovalUtil

describe('removeAssetFromMarkdown', () => {
  it('删除独立一行的本地图片语法时，应该连同行尾换行一起移除', () => {
    const content = '# 标题\n![封面](<./assets/demo.png>)\n下一行\n'

    const result = removeAssetFromMarkdown(content, {
      kind: 'image',
      rawSrc: './assets/demo.png',
      occurrence: 1,
      lineStart: 2,
      lineEnd: 2,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('# 标题\n下一行\n')
  })

  it('同一路径出现多次时，应该只删除当前右键命中的那一次', () => {
    const content = '前缀 ![图](<./same.png>) 中间 ![图](<./same.png>) 后缀'

    const result = removeAssetFromMarkdown(content, {
      kind: 'image',
      rawSrc: './same.png',
      occurrence: 2,
      lineStart: 1,
      lineEnd: 1,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('前缀 ![图](<./same.png>) 中间  后缀')
  })

  it('删除本地视频语法时，应该只移除对应的 !video(...) 片段', () => {
    const content = 'before\n!video(./video/demo.mp4)\nafter\n'

    const result = removeAssetFromMarkdown(content, {
      kind: 'video',
      rawSrc: './video/demo.mp4',
      occurrence: 1,
      lineStart: 2,
      lineEnd: 2,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('before\nafter\n')
  })

  it('删除本地音频语法时，应该只移除对应的 !audio(...) 片段', () => {
    const content = 'before\n!audio(./audio/demo.mp3)\nafter\n'

    const result = removeAssetFromMarkdown(content, {
      kind: 'audio',
      rawSrc: './audio/demo.mp3',
      occurrence: 1,
      lineStart: 2,
      lineEnd: 2,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('before\nafter\n')
  })

  it('删除本地链接语法时，应该只移除当前命中的链接片段', () => {
    const content = '前缀 [附件](<./files/demo.pdf>) 后缀 [附件](<./files/demo.pdf>)'

    const result = removeAssetFromMarkdown(content, {
      kind: 'link',
      rawSrc: './files/demo.pdf',
      occurrence: 2,
      lineStart: 1,
      lineEnd: 1,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('前缀 [附件](<./files/demo.pdf>) 后缀 ')
  })

  it('删除链接时，应该兼容 markdown-it 编码后的本地相对路径', () => {
    const content = '[附件](<./files/demo file.pdf>)'

    const result = removeAssetFromMarkdown(content, {
      kind: 'link',
      rawSrc: './files/demo%20file.pdf',
      occurrence: 1,
      lineStart: 1,
      lineEnd: 1,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('')
  })

  it('删除链接时，应该兼容 markdown-it 编码后的 Windows 本地路径', () => {
    const content = String.raw`[附件](D:\demo\test.pdf)`

    const result = removeAssetFromMarkdown(content, {
      kind: 'link',
      rawSrc: 'D:%5Cdemo%5Ctest.pdf',
      occurrence: 1,
      lineStart: 1,
      lineEnd: 1,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('')
  })

  it('删除图片时，应该兼容文件名中包含右括号', () => {
    const content = '![图](<./image (1).png>)'

    const result = removeAssetFromMarkdown(content, {
      kind: 'image',
      rawSrc: './image (1).png',
      occurrence: 1,
      lineStart: 1,
      lineEnd: 1,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('')
  })

  it('删除链接时，应该兼容文件名中包含右括号', () => {
    const content = '[附件](./report(final).pdf)'

    const result = removeAssetFromMarkdown(content, {
      kind: 'link',
      rawSrc: './report(final).pdf',
      occurrence: 1,
      lineStart: 1,
      lineEnd: 1,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('')
  })

  it('删除视频时，应该兼容文件名中包含右括号', () => {
    const content = '!video(./video/demo(1).mp4)'

    const result = removeAssetFromMarkdown(content, {
      kind: 'video',
      rawSrc: './video/demo(1).mp4',
      occurrence: 1,
      lineStart: 1,
      lineEnd: 1,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('')
  })

  it('删除音频时，应该兼容文件名中包含右括号', () => {
    const content = '!audio(./audio/demo(1).mp3)'

    const result = removeAssetFromMarkdown(content, {
      kind: 'audio',
      rawSrc: './audio/demo(1).mp3',
      occurrence: 1,
      lineStart: 1,
      lineEnd: 1,
    })

    expect(result.removed).toBe(true)
    expect(result.content).toBe('')
  })

  it('删除当前片段后，如果仍有其他语法引用同一物理资源，应该能统计出剩余引用', () => {
    const remainingContent = '[附件](./assets/../assets/demo.png)'

    const count = countRemainingAssetReferences(remainingContent, {
      kind: 'image',
      rawSrc: './assets/demo.png',
    }, {
      resolveComparablePath: (rawPath) => {
        if (!rawPath) {
          return null
        }
        return path.posix.normalize(rawPath)
      },
    })

    expect(count).toBe(1)
  })

  it('应该返回当前文档内同一物理资源的总引用数', () => {
    const content = '![图](./assets/demo.png)\n[附件](./assets/../assets/demo.png)\n'

    const count = countRemainingAssetReferences(content, {
      kind: 'image',
      rawSrc: './assets/demo.png',
    }, {
      resolveComparablePath: rawPath => path.posix.normalize(rawPath),
    })

    expect(count).toBe(2)
  })

  it('删除全部引用并删除文件前，应该清理同一物理资源的全部引用', () => {
    const content = '![图](./assets/demo.png)\n[附件](./assets/../assets/demo.png)\n保留内容\n'

    const result = removeAllAssetReferencesFromMarkdown(content, {
      kind: 'image',
      rawSrc: './assets/demo.png',
    }, {
      resolveComparablePath: rawPath => path.posix.normalize(rawPath),
    })

    expect(result.removed).toBe(true)
    expect(result.removedCount).toBe(2)
    expect(result.content).toBe('保留内容\n')
  })

  it('找不到当前右键命中的资源片段时，应该保持原文不变', () => {
    const content = '![图](<./same.png>)\n![图](<./same.png>)\n'

    const result = removeAssetFromMarkdown(content, {
      kind: 'image',
      rawSrc: './same.png',
      occurrence: 3,
      lineStart: 1,
      lineEnd: 2,
    })

    expect(result.removed).toBe(false)
    expect(result.content).toBe(content)
  })
})
