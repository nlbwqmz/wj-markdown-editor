import assert from 'node:assert/strict'

import MarkdownIt from 'markdown-it'

import codeBlockPlugin from '../markdownItCodeBlock.js'

const { test } = await import('node:test')

test('普通 fenced code block 必须输出可访问的复制按钮结构', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const renderedHtml = md.render('```js\nconsole.log(1)\n```')

  assert.match(renderedHtml, /pre-container-copy/u)
  assert.equal(renderedHtml.includes('hidden'), false)
  assert.match(renderedHtml, /title="复制"/u)
  assert.match(renderedHtml, /aria-label="复制"/u)
})
