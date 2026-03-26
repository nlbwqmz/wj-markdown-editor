import assert from 'node:assert/strict'

import MarkdownItKatexPackage from '@vscode/markdown-it-katex'
import MarkdownIt from 'markdown-it'
import MarkdownItDefList from 'markdown-it-deflist'

import markdownItKatexLineNumber from '../markdownItKatexLineNumber.js'
import markdownItLineNumber from '../markdownItLineNumber.js'

const { test } = await import('node:test')
const MarkdownItKatex = MarkdownItKatexPackage.default ?? MarkdownItKatexPackage

test('定义列表术语节点必须输出有效的闭区间行号', () => {
  const md = new MarkdownIt()
  md.use(MarkdownItDefList)
  markdownItLineNumber(md)

  const tokens = md.parse('术语\n: 定义内容\n', {})
  const termToken = tokens.find(token => token.type === 'dt_open')

  assert.ok(termToken, '定义列表必须产出 dt_open token')
  assert.equal(termToken.attrGet('data-line-start'), '1')
  assert.equal(termToken.attrGet('data-line-end'), '1')
})

test('定义列表 dd 节点必须从定义正文所在行开始计数', () => {
  const md = new MarkdownIt()
  md.use(MarkdownItDefList)
  markdownItLineNumber(md)

  const tokens = md.parse('术语一\n: 定义一\n\n术语二\n: 定义二\n\n', {})
  const definitionTokens = tokens.filter(token => token.type === 'dd_open')

  assert.equal(definitionTokens.length, 2, '双定义列表必须产出两个 dd_open token')
  assert.equal(definitionTokens[0].attrGet('data-line-start'), '2')
  assert.equal(definitionTokens[0].attrGet('data-line-end'), '2')
  assert.equal(definitionTokens[1].attrGet('data-line-start'), '5')
  assert.equal(definitionTokens[1].attrGet('data-line-end'), '5')
})

test('块级公式必须把 token 行号渲染到 katex 根节点', () => {
  const md = new MarkdownIt()
  md.use(MarkdownItKatex, { throwOnError: false })
  markdownItLineNumber(md)
  markdownItKatexLineNumber(md)

  const renderedHtml = md.render('$$\n\\int_{0}^{1} x^2 \\, dx = \\frac{1}{3}\n$$\n')

  assert.match(
    renderedHtml,
    /<p class="katex-block" data-line-start="1" data-line-end="3">/u,
    '块级公式根节点必须保留 data-line-start / data-line-end',
  )
})
