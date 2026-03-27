import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readMarkdownEditSource() {
  return fs.readFileSync(new URL('../MarkdownEdit.vue', import.meta.url), 'utf8')
}

test('MarkdownEdit 会声明 previewPosition prop 且默认回退到右侧布局', () => {
  const source = readMarkdownEditSource()

  assert.ok(source.includes('previewPosition'))
  assert.ok(source.includes('default: () => \'right\''))
})

test('MarkdownEdit 会使用 resolveMarkdownEditLayoutMode 解析布局类', () => {
  const source = readMarkdownEditSource()

  assert.ok(source.includes('resolveMarkdownEditLayoutMode'))
  assert.ok(source.includes('previewPosition: props.previewPosition'))
  assert.ok(source.includes('layoutMode.value.gridTemplateClass'))
})

test('MarkdownEdit 会按 layoutMode.columnGutters 的 refKey 绑定 Split 分隔条', () => {
  const source = readMarkdownEditSource()

  assert.ok(source.includes('layoutMode.value.columnGutters'))
  assert.ok(source.includes('refKey'))
  assert.ok(source.includes('gutterRef: gutterRef.value'))
  assert.ok(source.includes('gutterMenuRef: gutterMenuRef.value'))
  assert.ok(source.includes('resolveMarkdownEditSplitColumnGutters(layoutMode.value.columnGutters, gutterRefMap)'))
})

test('MarkdownEdit 的 grid-template-columns 会保持 split-grid 可解析的列语法', () => {
  const source = readMarkdownEditSource()
  const gridTemplateColumnsList = source
    .split('grid-template-columns:')
    .slice(1)
    .map(segment => segment.split(';', 1)[0]?.trim())
    .filter(Boolean)

  assert.ok(gridTemplateColumnsList.length > 0, '缺少编辑页布局列模板声明')

  for (const gridTemplateColumns of gridTemplateColumnsList) {
    const columnTokens = gridTemplateColumns.split(/\s+/u)

    for (const token of columnTokens) {
      assert.match(
        token,
        /^(auto|-?(?:\d+(?:\.\d+)?|\.\d+)(px|fr|%))$/u,
        `split-grid 无法解析的列定义: ${token}`,
      )
    }
  }
})

test('MarkdownEdit 会接入 render items helper，并按 layoutRenderItems 动态渲染布局项', () => {
  const source = readMarkdownEditSource()

  assert.ok(source.includes('resolveMarkdownEditRenderItems'))
  assert.ok(source.includes('const layoutRenderItems = computed(() => resolveMarkdownEditRenderItems(layoutMode.value))'))
  assert.ok(source.includes('v-for="item in layoutRenderItems"'))
})

test('MarkdownEdit 会在 gutter 拖拽开始前同步当前计算列宽，而不是在初始化时冻结布局', () => {
  const source = readMarkdownEditSource()

  assert.ok(source.includes('window.getComputedStyle(editorContainer.value).gridTemplateColumns'))
  assert.ok(source.includes('addEventListener(\'mousedown\', syncInlineGridTemplateColumnsFromComputedStyle, true)'))
  assert.ok(source.includes('addEventListener(\'touchstart\', syncInlineGridTemplateColumnsFromComputedStyle, true)'))
})

test('MarkdownEdit 的布局切换仍只重置 Split，不会重新初始化或销毁编辑器实例', () => {
  const source = readMarkdownEditSource()

  assert.ok(source.includes('watch(layoutMode, () => {'))
  assert.ok(source.includes('resetSplitLayout()'))
  assert.ok(source.includes('initEditor({'))
  assert.ok(source.includes('destroyEditor()'))
  assert.equal(source.includes('watch(layoutMode, () => {\r\n  initEditor('), false)
  assert.equal(source.includes('watch(layoutMode, () => {\r\n  destroyEditor('), false)
  assert.equal(source.includes('watch(layoutMode, () => {\n  initEditor('), false)
  assert.equal(source.includes('watch(layoutMode, () => {\n  destroyEditor('), false)
})
