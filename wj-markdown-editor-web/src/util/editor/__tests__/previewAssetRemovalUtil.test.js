import assert from 'node:assert/strict'
import {
  removeAllAssetReferencesFromMarkdown,
  removeAssetFromMarkdown,
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
