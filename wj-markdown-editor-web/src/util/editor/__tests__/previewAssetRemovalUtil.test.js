import assert from 'node:assert/strict'
import {
  countRemainingAssetReferences,
  removeAllAssetReferencesFromMarkdown,
  removeAssetFromMarkdown,
  shouldCleanupMarkdownAfterDeleteResult,
} from '../previewAssetRemovalUtil.js'

const { test } = await import('node:test')

test('删除本地链接时，不应把前面未闭合的中括号内容一起误删', () => {
  const content = [
    '前文里有一个孤立左括号 [不会闭合',
    '这里还有普通文字',
    '[近电体 v3.0.0 升级内容.md](<assets/近电体 v3.0.0 升级内容_4cDwS3.md>)',
    '后文保留',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'link',
    rawSrc: 'assets/近电体 v3.0.0 升级内容_4cDwS3.md',
    occurrence: 1,
    lineStart: 3,
    lineEnd: 3,
  })

  assert.equal(result.removed, true)
  assert.equal(result.cursorPosition, result.content.indexOf('后文保留'))
  assert.equal(result.content, [
    '前文里有一个孤立左括号 [不会闭合',
    '这里还有普通文字',
    '后文保留',
  ].join('\n'))
})

test('删除本地链接时，应按 markdown-it 规则处理链接文本里的代码片段', () => {
  const content = [
    '[示例 `[` 文本](<assets/target.md>)',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'link',
    rawSrc: 'assets/target.md',
    occurrence: 1,
    lineStart: 1,
    lineEnd: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, '后文')
})

test('删除指定本地图片引用后，光标应落到被删除引用的位置', () => {
  const content = [
    '第一段',
    '![封面](assets/target.png)',
    '第二段',
    '![封面](assets/target.png)',
    '第三段',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'image',
    rawSrc: 'assets/target.png',
    occurrence: 2,
    lineStart: 4,
    lineEnd: 4,
  })

  assert.equal(result.removed, true)
  assert.equal(result.cursorPosition, result.content.indexOf('第三段'))
  assert.equal(result.content, [
    '第一段',
    '![封面](assets/target.png)',
    '第二段',
    '第三段',
  ].join('\n'))
})

test('预览资源上下文只提供 assetType 时，删除当前图片引用仍应命中删除链路', () => {
  const content = [
    '第一段',
    '![封面](assets/target.png)',
    '第二段',
    '![封面](assets/target.png)',
    '第三段',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    assetType: 'image',
    rawSrc: 'assets/target.png',
    occurrence: 2,
    lineStart: 4,
    lineEnd: 4,
  })

  assert.equal(result.removed, true)
  assert.equal(result.cursorPosition, result.content.indexOf('第三段'))
  assert.equal(result.content, [
    '第一段',
    '![封面](assets/target.png)',
    '第二段',
    '第三段',
  ].join('\n'))
})

test('删除链路在 assetType 非法但 legacy kind 合法时，应回退到 legacy kind', () => {
  const content = [
    '第一段',
    '![封面](assets/target.png)',
    '第二段',
    '![封面](assets/target.png)',
    '第三段',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    assetType: 'invalid-kind',
    kind: 'image',
    rawSrc: 'assets/target.png',
    occurrence: 2,
    lineStart: 4,
    lineEnd: 4,
  })

  assert.equal(result.removed, true)
  assert.equal(result.cursorPosition, result.content.indexOf('第三段'))
  assert.equal(result.content, [
    '第一段',
    '![封面](assets/target.png)',
    '第二段',
    '第三段',
  ].join('\n'))
})

test('删除本地图片时，应按 markdown-it 规则处理 alt 文本里的复杂内容', () => {
  const content = [
    '![示例 `](` 文本](<assets/target.png>)',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'image',
    rawSrc: 'assets/target.png',
    occurrence: 1,
    lineStart: 1,
    lineEnd: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, '后文')
})

test('删除被外层链接包裹的当前图片引用时，应移除整个外层 Markdown 片段', () => {
  const content = '[![alt](./img.png)](https://example.com)'

  const result = removeAssetFromMarkdown(content, {
    kind: 'image',
    rawSrc: './img.png',
    occurrence: 1,
    lineStart: 1,
    lineEnd: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, '')
})

test('删除本地图片时，应兼容括号形式的 title 写法', () => {
  const content = [
    '![封面](assets/target.png (封面图))',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'image',
    rawSrc: 'assets/target.png',
    occurrence: 1,
    lineStart: 1,
    lineEnd: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, '后文')
})

test('删除 HTML 本地图片时，应命中原始 img 标签并保留其他文本', () => {
  const content = [
    '<img src="./assets/target.png" style="width: 120px" class="demo-image" alt="示例" />',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'image',
    rawSrc: './assets/target.png',
    occurrence: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, '后文')
})

test('删除全部 HTML 本地图片引用时，应删除同一路径的不同样式标签', () => {
  const content = [
    '第一段',
    '<img src="./assets/target.png" style="width: 120px" />',
    '第二段',
    '<img src="./assets/target.png" style="width: 240px" class="large-image" />',
    '第三段',
  ].join('\n')

  const result = removeAllAssetReferencesFromMarkdown(content, {
    rawSrc: './assets/target.png',
    occurrence: 1,
  }, {
    resolveComparablePath: value => value,
  })

  assert.equal(result.removed, true)
  assert.equal(result.removedCount, 2)
  assert.equal(result.content, [
    '第一段',
    '第二段',
    '第三段',
  ].join('\n'))
})

test('统计 HTML 图片引用时，应排除 fenced code、行内代码、转义文本与注释中的 img 字面量', () => {
  const content = [
    '```html',
    '<img src="./assets/target.png" />',
    '```',
    '`<img src="./assets/target.png" />`',
    '\\<img src="./assets/target.png" />',
    '<!-- <img src="./assets/target.png" /> -->',
    '<img src="./assets/target.png" style="width: 120px" />',
  ].join('\n')

  const referenceCount = countRemainingAssetReferences(content, {
    rawSrc: './assets/target.png',
  }, {
    resolveComparablePath: value => value,
  })

  assert.equal(referenceCount, 1)
})

test('统计 HTML 图片引用时，应忽略 script 模板字符串里的伪 img 字面量', () => {
  const content = [
    '<script>const tpl = "<img src=\'./assets/target.png\' />"</script>',
    '<img src="./assets/target.png" style="width: 120px" />',
  ].join('\n')

  const referenceCount = countRemainingAssetReferences(content, {
    rawSrc: './assets/target.png',
  }, {
    resolveComparablePath: value => value,
  })

  assert.equal(referenceCount, 1)
})

test('统计 HTML 图片引用时，应忽略 textarea 与 template 容器中的伪 img 字面量', () => {
  const content = [
    'foo <textarea><img src="./assets/target.png" /></textarea>',
    'foo <template><img src="./assets/target.png" /></template>',
    '<img src="./assets/target.png" style="width: 120px" />',
  ].join('\n')

  const referenceCount = countRemainingAssetReferences(content, {
    rawSrc: './assets/target.png',
  }, {
    resolveComparablePath: value => value,
  })

  assert.equal(referenceCount, 1)
})

test('统计 HTML 图片引用时，应忽略其他标签属性值里的伪 img 字面量', () => {
  const content = [
    '<div data-template="<img src=\'./assets/target.png\' />"></div>',
    '<img src="./assets/target.png" />',
  ].join('\n')

  const referenceCount = countRemainingAssetReferences(content, {
    rawSrc: './assets/target.png',
  }, {
    resolveComparablePath: value => value,
  })

  assert.equal(referenceCount, 1)
})

test('删除 HTML 图片引用时，应跳过不会被渲染的 img 字面量并保留原文本', () => {
  const content = [
    '```html',
    '<img src="./assets/target.png" />',
    '```',
    '`<img src="./assets/target.png" />`',
    '\\<img src="./assets/target.png" />',
    '<!-- <img src="./assets/target.png" /> -->',
    '<img src="./assets/target.png" style="width: 120px" />',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'image',
    rawSrc: './assets/target.png',
    occurrence: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, [
    '```html',
    '<img src="./assets/target.png" />',
    '```',
    '`<img src="./assets/target.png" />`',
    '\\<img src="./assets/target.png" />',
    '<!-- <img src="./assets/target.png" /> -->',
    '后文',
  ].join('\n'))
})

test('删除 HTML 图片引用时，应忽略 script 模板字符串里的伪 img 字面量', () => {
  const content = [
    '<script>const tpl = "<img src=\'./assets/target.png\' />"</script>',
    '<img src="./assets/target.png" style="width: 120px" />',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'image',
    rawSrc: './assets/target.png',
    occurrence: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, [
    '<script>const tpl = "<img src=\'./assets/target.png\' />"</script>',
    '后文',
  ].join('\n'))
})

test('删除 HTML 图片引用时，应忽略 textarea 与 template 容器中的伪 img 字面量', () => {
  const content = [
    'foo <textarea><img src="./assets/target.png" /></textarea>',
    'foo <template><img src="./assets/target.png" /></template>',
    '<img src="./assets/target.png" style="width: 120px" />',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'image',
    rawSrc: './assets/target.png',
    occurrence: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, [
    'foo <textarea><img src="./assets/target.png" /></textarea>',
    'foo <template><img src="./assets/target.png" /></template>',
    '后文',
  ].join('\n'))
})

test('删除 HTML 图片引用时，应忽略其他标签属性值里的伪 img 字面量', () => {
  const content = [
    '<div data-template="<img src=\'./assets/target.png\' />"></div>',
    '<img src="./assets/target.png" />',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'image',
    rawSrc: './assets/target.png',
    occurrence: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, [
    '<div data-template="<img src=\'./assets/target.png\' />"></div>',
    '后文',
  ].join('\n'))
})

test('删除全部 HTML 图片引用时，应保留代码块与注释中的伪 img 字面量', () => {
  const content = [
    '```html',
    '<img src="./assets/target.png" />',
    '```',
    '<!-- <img src="./assets/target.png" /> -->',
    '第一段',
    '<img src="./assets/target.png" style="width: 120px" />',
    '第二段',
    '<img src="./assets/target.png" style="width: 240px" class="large-image" />',
    '第三段',
  ].join('\n')

  const result = removeAllAssetReferencesFromMarkdown(content, {
    rawSrc: './assets/target.png',
    occurrence: 1,
  }, {
    resolveComparablePath: value => value,
  })

  assert.equal(result.removed, true)
  assert.equal(result.removedCount, 2)
  assert.equal(result.content, [
    '```html',
    '<img src="./assets/target.png" />',
    '```',
    '<!-- <img src="./assets/target.png" /> -->',
    '第一段',
    '第二段',
    '第三段',
  ].join('\n'))
})

test('删除全部 HTML 图片引用时，应保留其他标签属性值里的伪 img 字面量', () => {
  const content = [
    '<div data-template="<img src=\'./assets/target.png\' />"></div>',
    '第一段',
    '<img src="./assets/target.png" style="width: 120px" />',
    '第二段',
    '<img src="./assets/target.png" style="width: 240px" class="large-image" />',
    '第三段',
  ].join('\n')

  const result = removeAllAssetReferencesFromMarkdown(content, {
    rawSrc: './assets/target.png',
    occurrence: 1,
  }, {
    resolveComparablePath: value => value,
  })

  assert.equal(result.removed, true)
  assert.equal(result.removedCount, 2)
  assert.equal(result.content, [
    '<div data-template="<img src=\'./assets/target.png\' />"></div>',
    '第一段',
    '第二段',
    '第三段',
  ].join('\n'))
})

test('删除全部 HTML 图片引用时，应保留 script 模板字符串里的伪 img 字面量', () => {
  const content = [
    '<script>const tpl = "<img src=\'./assets/target.png\' />"</script>',
    '第一段',
    '<img src="./assets/target.png" style="width: 120px" />',
    '第二段',
    '<img src="./assets/target.png" style="width: 240px" class="large-image" />',
    '第三段',
  ].join('\n')

  const result = removeAllAssetReferencesFromMarkdown(content, {
    rawSrc: './assets/target.png',
    occurrence: 1,
  }, {
    resolveComparablePath: value => value,
  })

  assert.equal(result.removed, true)
  assert.equal(result.removedCount, 2)
  assert.equal(result.content, [
    '<script>const tpl = "<img src=\'./assets/target.png\' />"</script>',
    '第一段',
    '第二段',
    '第三段',
  ].join('\n'))
})

test('删除表格单元格里的 HTML 图片引用时，应优先移除当前单元格而不是误删别处同路径图片', () => {
  const content = [
    '| <img src="./assets/target.png" /> |',
    '| --- |',
    '第一段',
    '<img src="./assets/target.png" style="width: 120px" />',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'image',
    rawSrc: './assets/target.png',
    occurrence: 1,
    lineStart: 1,
    lineEnd: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, [
    '|  |',
    '| --- |',
    '第一段',
    '<img src="./assets/target.png" style="width: 120px" />',
    '后文',
  ].join('\n'))
})

test('删除 autolink 远程链接时，应命中真实 Markdown 片段并移除整段', () => {
  const content = [
    '<https://example.com/a.png>',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'link',
    rawSrc: 'https://example.com/a.png',
    occurrence: 1,
    lineStart: 1,
    lineEnd: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, '后文')
})

test('删除 linkify 裸 URL 时，应命中真实 Markdown 片段并移除整段', () => {
  const content = [
    'https://example.com/a.png',
    '后文',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'link',
    rawSrc: 'https://example.com/a.png',
    occurrence: 1,
    lineStart: 1,
    lineEnd: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, '后文')
})

test('删除全部本地链接引用时，不应误删无关文本', () => {
  const content = [
    '前文里有一个孤立左括号 [不会闭合',
    '[近电体 v3.0.0 升级内容.md](<assets/近电体 v3.0.0 升级内容_4cDwS3.md>)',
    '这里还有普通文字',
    '[近电体 v3.0.0 升级内容.md](<assets/近电体 v3.0.0 升级内容_4cDwS3.md>)',
    '后文保留',
  ].join('\n')

  const result = removeAllAssetReferencesFromMarkdown(content, {
    rawSrc: 'assets/近电体 v3.0.0 升级内容_4cDwS3.md',
  })

  assert.equal(result.removed, true)
  assert.equal(result.removedCount, 2)
  assert.equal(result.content, [
    '前文里有一个孤立左括号 [不会闭合',
    '这里还有普通文字',
    '后文保留',
  ].join('\n'))
})

test('删除全部本地资源引用时，光标应落到所选 occurrence 对应的位置', () => {
  const content = [
    '第一段',
    '![封面](assets/target.png)',
    '第二段',
    '![封面](assets/target.png)',
    '第三段',
    '![封面](assets/target.png)',
    '第四段',
  ].join('\n')

  const result = removeAllAssetReferencesFromMarkdown(content, {
    rawSrc: 'assets/target.png',
    occurrence: 2,
  })

  assert.equal(result.removed, true)
  assert.equal(result.removedCount, 3)
  assert.equal(result.cursorPosition, result.content.indexOf('第三段'))
  assert.equal(result.content, [
    '第一段',
    '第二段',
    '第三段',
    '第四段',
  ].join('\n'))
})

test('未保存文档场景统计引用数时，应将等价相对路径视为同一资源', () => {
  const content = [
    '![封面](./assets/demo.png)',
    '![封面](assets/../assets/demo.png)',
    '![封面](assets/other.png)',
  ].join('\n')

  const referenceCount = countRemainingAssetReferences(content, {
    rawSrc: './assets/demo.png',
  }, {
    resolveComparablePath: value => value,
  })

  assert.equal(referenceCount, 2)
})

test('未保存文档场景删除全部引用时，应删除等价相对路径的全部命中项', () => {
  const content = [
    '第一段',
    '![封面](./assets/demo.png)',
    '第二段',
    '![封面](assets/../assets/demo.png)',
    '第三段',
  ].join('\n')

  const result = removeAllAssetReferencesFromMarkdown(content, {
    rawSrc: './assets/demo.png',
    occurrence: 1,
  }, {
    resolveComparablePath: value => value,
  })

  assert.equal(result.removed, true)
  assert.equal(result.removedCount, 2)
  assert.equal(result.content, [
    '第一段',
    '第二段',
    '第三段',
  ].join('\n'))
})

test('未保存文档场景统计本地链接引用数时，应按文件路径归并 query 和 hash', () => {
  const content = [
    '[文档 A](./docs/index.html?tab=a)',
    '[文档 B](docs/index.html#guide)',
    '[文档 C](docs/other.html#guide)',
  ].join('\n')
  const resolveComparablePath = (value) => {
    if (value === './docs/index.html?tab=a' || value === 'docs/index.html#guide' || value === './docs/index.html?tab=current') {
      return 'wj-local-file:d:/docs/index.html'
    }
    return value
  }

  const referenceCount = countRemainingAssetReferences(content, {
    rawSrc: './docs/index.html?tab=current',
  }, {
    resolveComparablePath,
  })

  assert.equal(referenceCount, 2)
})

test('未保存文档场景删除全部本地链接引用时，应按文件路径删除同一文件的不同 query 和 hash', () => {
  const content = [
    '第一段',
    '[文档 A](./docs/index.html?tab=a)',
    '第二段',
    '[文档 B](docs/index.html#guide)',
    '第三段',
    '[文档 C](docs/other.html#guide)',
    '第四段',
  ].join('\n')
  const resolveComparablePath = (value) => {
    if (value === './docs/index.html?tab=a' || value === 'docs/index.html#guide' || value === './docs/index.html?tab=current') {
      return 'wj-local-file:d:/docs/index.html'
    }
    return value
  }

  const result = removeAllAssetReferencesFromMarkdown(content, {
    rawSrc: './docs/index.html?tab=current',
    occurrence: 1,
  }, {
    resolveComparablePath,
  })

  assert.equal(result.removed, true)
  assert.equal(result.removedCount, 2)
  assert.equal(result.content, [
    '第一段',
    '第二段',
    '第三段',
    '[文档 C](docs/other.html#guide)',
    '第四段',
  ].join('\n'))
})

test('仅删除当前本地链接引用时，不应连带删除同文件的其他 query 或 hash 引用', () => {
  const content = [
    '第一段',
    '[文档 A](./docs/index.html?tab=a)',
    '第二段',
    '[文档 B](docs/index.html#guide)',
    '第三段',
  ].join('\n')

  const result = removeAssetFromMarkdown(content, {
    kind: 'link',
    rawSrc: './docs/index.html?tab=a',
    occurrence: 1,
    lineStart: 2,
    lineEnd: 2,
  })

  assert.equal(result.removed, true)
  assert.equal(result.content, [
    '第一段',
    '第二段',
    '[文档 B](docs/index.html#guide)',
    '第三段',
  ].join('\n'))
})

test('无法证明资源身份时，统计引用数不应将文件名中的 # 误判为 hash', () => {
  const content = [
    '[文档 A](assets/a#b.md)',
    '[文档 B](assets/a#c.md)',
  ].join('\n')

  const referenceCount = countRemainingAssetReferences(content, {
    rawSrc: 'assets/a#b.md',
  })

  assert.equal(referenceCount, 1)
})

test('无法证明资源身份时，删除全部引用不应误删文件名包含 # 的其他文件', () => {
  const content = [
    '第一段',
    '[文档 A](assets/a#b.md)',
    '第二段',
    '[文档 B](assets/a#c.md)',
    '第三段',
  ].join('\n')

  const result = removeAllAssetReferencesFromMarkdown(content, {
    rawSrc: 'assets/a#b.md',
    occurrence: 1,
  })

  assert.equal(result.removed, true)
  assert.equal(result.removedCount, 1)
  assert.equal(result.content, [
    '第一段',
    '第二段',
    '[文档 B](assets/a#c.md)',
    '第三段',
  ].join('\n'))
})

test('删除本地资源返回 delete-failed 时，不得继续清理 Markdown', () => {
  assert.equal(shouldCleanupMarkdownAfterDeleteResult({
    ok: false,
    removed: false,
    reason: 'delete-failed',
    path: 'D:\\docs\\assets\\demo.png',
  }), false)
})
