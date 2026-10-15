import assert from 'node:assert/strict'

import MarkdownIt from 'markdown-it'

import frontMatterPlugin from '../markdownItFrontMatter.js'
import lineNumberPlugin from '../markdownItLineNumber.js'

const { test } = await import('node:test')

function createMd() {
  const md = new MarkdownIt()
  md.use(frontMatterPlugin)
  return md
}

function createMdWithLineNumber() {
  const md = createMd()
  md.use(lineNumberPlugin)
  return md
}

function countOccurrences(source, keyword) {
  return source.split(keyword).length - 1
}

test('文档开头的 front matter 渲染为不带工具栏的代码块', () => {
  const md = createMd()

  const renderedHtml = md.render('---\ntitle: 我的第一篇博客\ntags:\n  - markdown\n---\n\n# 标题')

  assert.match(renderedHtml, /<div class="pre-container">/u)
  assert.doesNotMatch(renderedHtml, /pre-container-toolbar/u)
  assert.doesNotMatch(renderedHtml, /pre-container-action-slot/u)
  assert.doesNotMatch(renderedHtml, /pre-container-lang/u)
  assert.doesNotMatch(renderedHtml, /pre-container-copy/u)
  assert.match(renderedHtml, /<code class="hljs language-yaml" data-wj-hl-pending="1" data-wj-hl-lang="yaml">/u)
  assert.match(renderedHtml, /title: 我的第一篇博客/u)
  // 代码内容不参与缩进清理，YAML 缩进必须原样保留
  assert.match(renderedHtml, / {2}- markdown/u)
  assert.equal(renderedHtml.includes('---'), false)
  assert.match(renderedHtml, /<h1>标题<\/h1>/u)
})

test('front matter 参与行号映射，行号属性落在 pre 上', () => {
  const md = createMdWithLineNumber()

  const renderedHtml = md.render('---\ntitle: 我的第一篇博客\ntags:\n  - markdown\n---\n\n# 标题')

  assert.match(renderedHtml, /<pre data-line-start="1" data-line-end="5">/u)
  assert.match(renderedHtml, /<h1 data-line-start="7" data-line-end="7">标题<\/h1>/u)
})

test('空 front matter 不渲染任何内容', () => {
  const md = createMd()

  const renderedHtml = md.render('---\n---\n\n# 标题')

  assert.doesNotMatch(renderedHtml, /pre-container/u)
  assert.doesNotMatch(renderedHtml, /<hr/u)
  assert.match(renderedHtml, /<h1>标题<\/h1>/u)
})

test('未闭合的 front matter 按普通正文渲染', () => {
  const md = createMd()

  const renderedHtml = md.render('---\ntitle: 未闭合\n\n正文')

  assert.doesNotMatch(renderedHtml, /pre-container/u)
  assert.match(renderedHtml, /<hr/u)
  assert.match(renderedHtml, /title: 未闭合/u)
})

test('front matter 前有空行时不识别', () => {
  const md = createMd()

  const renderedHtml = md.render('\n---\ntitle: x\n---\n')

  assert.doesNotMatch(renderedHtml, /pre-container/u)
})

test('正文中间的 --- 块不识别为 front matter', () => {
  const md = createMd()

  const renderedHtml = md.render('# 标题\n\n---\ntitle: x\n---\n')

  assert.doesNotMatch(renderedHtml, /pre-container/u)
})

test('缩进的起始分隔符不被识别', () => {
  const md = createMd()

  const renderedHtml = md.render('  ---\ntitle: x\n---\n')

  assert.doesNotMatch(renderedHtml, /pre-container/u)
})

test('三个以上连字符不被识别为 front matter 分隔符', () => {
  const md = createMd()

  const renderedHtml = md.render('----\ntitle: x\n----\n')

  assert.doesNotMatch(renderedHtml, /pre-container/u)
  assert.match(renderedHtml, /<hr/u)
})

test('以 ... 结束的块不被识别为 front matter', () => {
  const md = createMd()

  const renderedHtml = md.render('---\ntitle: x\n...\n')

  assert.doesNotMatch(renderedHtml, /pre-container/u)
})

test('文档中的第二个 front matter 块不识别', () => {
  const md = createMd()

  const renderedHtml = md.render('---\ntitle: a\n---\n\n---\nfoo: b\n---\n')

  assert.equal(countOccurrences(renderedHtml, 'pre-container'), 1)
  assert.match(renderedHtml, /title: a/u)
  // 第二个块回落为普通 markdown：--- 成 hr，foo: b 被 setext 规则当作二级标题
  assert.match(renderedHtml, /<h2>foo: b<\/h2>/u)
})

test('容忍 UTF-8 BOM', () => {
  const md = createMd()

  const renderedHtml = md.render('\uFEFF---\ntitle: x\n---\n')

  assert.match(renderedHtml, /<code class="hljs language-yaml"/u)
  assert.match(renderedHtml, /title: x/u)
  assert.equal(renderedHtml.includes('\uFEFF'), false)
})

test('块标量内缩进的 --- 不会被当作结束分隔符', () => {
  const md = createMd()

  const renderedHtml = md.render('---\ndescription: |\n  ---\n  内容\n---\n')

  assert.match(renderedHtml, /<code class="hljs language-yaml"/u)
  assert.match(renderedHtml, /description: \|/u)
  assert.match(renderedHtml, / {2}---\n {2}内容/u)
})

test('front matter 后紧跟正文时正文正常解析', () => {
  const md = createMd()

  const renderedHtml = md.render('---\ntitle: x\n---\n# 标题')

  assert.match(renderedHtml, /<h1>标题<\/h1>/u)
})

test('front matter 内容安全转义', () => {
  const md = createMd()

  const renderedHtml = md.render('---\ntitle: <script>alert(1)</script>\n---\n')

  assert.match(renderedHtml, /&lt;script&gt;/u)
  assert.doesNotMatch(renderedHtml, /<script>/u)
})

test('行尾空白的分隔符仍然被识别', () => {
  const md = createMd()

  const renderedHtml = md.render('---   \ntitle: x\n---   \n')

  assert.match(renderedHtml, /<code class="hljs language-yaml"/u)
  assert.match(renderedHtml, /title: x/u)
})
