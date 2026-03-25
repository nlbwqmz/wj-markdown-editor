import assert from 'node:assert/strict'

import MarkdownIt from 'markdown-it'
import MarkdownItContainer from 'markdown-it-container'

import markdownItContainerUtil from '../markdownItContainerUtil.js'

const { test } = await import('node:test')

test('details 容器必须输出独立 disclosure 结构', () => {
  const md = new MarkdownIt()
  const [detailsContainerPlugin] = markdownItContainerUtil.createContainerPlugin(md, ['details'])
  md.use(MarkdownItContainer, detailsContainerPlugin.type, detailsContainerPlugin)

  const renderedHtml = md.render('::: details 标题\n内容\n:::')

  assert.equal(renderedHtml.includes('wj-markdown-it-container'), false)
  assert.equal(renderedHtml.includes('wj-markdown-it-container-details'), false)
  assert.equal(renderedHtml.includes('style='), false)
  assert.match(renderedHtml, /<details/u)
  assert.match(renderedHtml, /<summary>/u)
})
