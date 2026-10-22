import assert from 'node:assert/strict'

const { test } = await import('node:test')

const enUSModule = await import('../../../i18n/enUS.js')
const zhCNModule = await import('../../../i18n/zhCN.js')
const settingSearchIndexModule = await import('../settingSearchIndex.js')
const settingSearchUtilModule = await import('../settingSearchUtil.js')

const enUS = enUSModule.default
const zhCN = zhCNModule.default
const { resolveSettingSearchItemList } = settingSearchIndexModule
const {
  normalizeSettingSearchText,
  searchSettingItems,
  splitSettingSearchHighlightSegments,
  tokenizeSettingSearchQuery,
} = settingSearchUtilModule

const shortcutKeyList = [
  { id: 'save', keymap: 'Ctrl+s', type: 'global' },
  { id: 'editor-bold', keymap: 'Ctrl+b', type: 'editor' },
]

/**
 * 按点路径读取 i18n 文案，模拟 vue-i18n 的 t()。
 */
function resolveMessageText(message, key) {
  return String(key).split('.').reduce((result, segment) => {
    if (result === undefined || result === null) {
      return undefined
    }
    return result[segment]
  }, message)
}

const itemList = resolveSettingSearchItemList({
  resolvePrimaryText: key => resolveMessageText(zhCN, key) ?? key,
  resolveAltText: key => resolveMessageText(enUS, key) ?? key,
  shortcutKeyList,
})

function search(query) {
  return searchSettingItems({ itemList, query })
}

function searchIdList(query) {
  return search(query).map(item => item.id)
}

test('归一化应统一全角半角、大小写与空白', () => {
  assert.equal(normalizeSettingSearchText('  Ｃｔｒｌ＋Ｓ  '), 'ctrl+s')
  assert.equal(normalizeSettingSearchText('Auto   Save'), 'auto save')
  assert.equal(normalizeSettingSearchText('  字体  '), '字体')
})

test('分词应按空白切分并限制 token 数量', () => {
  assert.deepEqual(tokenizeSettingSearchQuery('  文件   图片  '), ['文件', '图片'])
  assert.deepEqual(tokenizeSettingSearchQuery('a b c d e f g'), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(tokenizeSettingSearchQuery('   '), [])
})

test('空查询与无命中应返回空列表', () => {
  assert.deepEqual(search(''), [])
  assert.deepEqual(search('   '), [])
  assert.deepEqual(search('zzz-不存在'), [])
})

test('单 token 应支持子串包含匹配', () => {
  const idList = searchIdList('保存')
  assert.ok(idList.includes('general.autoSave'))
  assert.ok(idList.includes('file.file'))
})

test('前缀命中应排在包含命中之前', () => {
  const idList = searchIdList('自动')
  const autoSaveIndex = idList.indexOf('general.autoSave')
  assert.ok(autoSaveIndex >= 0)
  assert.equal(idList[0], 'general.autoSave')
})

test('多词应使用 OR 语义，任一 token 命中即保留', () => {
  const idList = searchIdList('文件 图片')
  assert.ok(idList.includes('file.file'))
  assert.ok(idList.includes('image.localPicture'))
  assert.ok(idList.length > 2)
})

test('多词应按命中 token 数优先排序', () => {
  const idList = searchIdList('github token')
  assert.equal(idList[0], 'imageBed.github.token')
  assert.ok(idList.includes('imageBed.github.repo'))
})

test('整串去空格一致时应获得额外加分并排在最前', () => {
  const idList = searchIdList('PDF 页眉')
  assert.equal(idList[0], 'export.pdfHeader')
  assert.ok(idList.includes('export.pdfFooter'))
})

test('分组名完全相等时应展开该分组全部设置项', () => {
  const resultList = search('水印')
  assert.equal(resultList.length, 11)
  assert.equal(resultList[0].id, 'watermark.watermark')
  assert.ok(resultList.every(item => item.sectionId === 'watermark'))
})

test('tab 名完全相等时应展开该 tab 全部设置项', () => {
  const idList = searchIdList('快捷键')
  assert.deepEqual(idList.sort(), ['shortcut.editor-bold', 'shortcut.save'])
})

test('非完全相等的 tab 名不应展开，避免结果爆炸', () => {
  const idList = searchIdList('编辑')
  assert.ok(idList.includes('view.editorPreviewPosition'))
  assert.ok(idList.includes('font.editArea'))
  assert.equal(idList.some(id => id.startsWith('shortcut.')), false)
})

test('字体应命中字体分组与所有字体大小相关项', () => {
  const idList = searchIdList('字体')
  assert.equal(idList.length, 8)
  assert.ok(idList.includes('font.editArea'))
  assert.ok(idList.includes('view.fontSize'))
  assert.ok(idList.includes('watermark.fontWeight'))
})

test('快捷键 keymap 应支持紧凑写法与空格写法', () => {
  assert.equal(searchIdList('ctrl+s')[0], 'shortcut.save')
  assert.equal(searchIdList('ctrl s')[0], 'shortcut.save')
})

test('另一语言 label 也应参与匹配', () => {
  assert.equal(searchIdList('line number')[0], 'editor.lineNumber')
  assert.ok(searchIdList('save').includes('shortcut.save'))
})

test('高亮片段应标出命中位置并合并重叠区间', () => {
  assert.deepEqual(splitSettingSearchHighlightSegments('自动保存', ['保存']), [
    { text: '自动', hit: false },
    { text: '保存', hit: true },
  ])

  assert.deepEqual(splitSettingSearchHighlightSegments('Ctrl+S', ['ctrl']), [
    { text: 'Ctrl', hit: true },
    { text: '+S', hit: false },
  ])

  assert.deepEqual(splitSettingSearchHighlightSegments('aaaa', ['aa']), [
    { text: 'aaaa', hit: true },
  ])

  assert.deepEqual(splitSettingSearchHighlightSegments('字体大小预览', ['字体', '预览']), [
    { text: '字体', hit: true },
    { text: '大小', hit: false },
    { text: '预览', hit: true },
  ])

  assert.deepEqual(splitSettingSearchHighlightSegments('字体大小', ['字体', '大小']), [
    { text: '字体大小', hit: true },
  ])

  assert.deepEqual(splitSettingSearchHighlightSegments('自动保存', []), [
    { text: '自动保存', hit: false },
  ])
})
