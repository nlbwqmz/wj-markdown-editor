import assert from 'node:assert/strict'

import hljs from 'highlight.js'
import MarkdownIt from 'markdown-it'

import codeBlockPlugin from '../markdownItCodeBlock.js'

const { test } = await import('node:test')

function getCodeClassTokens(renderedHtml) {
  const match = renderedHtml.match(/<code class="([^"]+)"/u)
  assert.ok(match, '普通 fenced code block 必须输出带 class 的 code 节点')
  return new Set(match[1].split(/\s+/u).filter(Boolean))
}

function getToolbarLangInfo(renderedHtml) {
  const match = renderedHtml.match(/<div class="([^"]*\bpre-container-lang\b[^"]*)">([^<]*)<\/div>/u)
  assert.ok(match, '普通 fenced code block 必须输出语言标签节点')
  return {
    classTokens: new Set(match[1].split(/\s+/u).filter(Boolean)),
    text: match[2],
  }
}

function getStableAutoDetectFixture() {
  const candidates = [
    '[core]\nname=value',
    'GET / HTTP/1.1\nHost: example.com',
    '{\n  "name": "test",\n  "value": 1\n}',
  ]

  const matchedCandidate = candidates.find(candidate => hljs.highlightAuto(candidate).language)
  assert.ok(matchedCandidate, '测试前提失败：必须存在至少一个可被 highlight.js 自动识别的样例')

  const detectedLanguage = hljs.highlightAuto(matchedCandidate).language
  assert.ok(detectedLanguage, '测试前提失败：自动识别成功场景必须拿到检测语言')

  return {
    code: matchedCandidate,
    detectedLanguage,
  }
}

test('普通 fenced code block 必须输出可访问的复制按钮结构', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const renderedHtml = md.render('```js\nconsole.log(1)\n```')

  assert.match(renderedHtml, /pre-container-copy/u)
  assert.match(renderedHtml, /role="button"/u)
  assert.match(renderedHtml, /tabindex="0"/u)
  assert.equal(renderedHtml.includes('hidden'), false)
  assert.match(renderedHtml, /title="复制"/u)
  assert.match(renderedHtml, /aria-label="复制"/u)
  assert.match(renderedHtml, /onclick="copyCode\('[^']+'\)"/u)
  assert.match(renderedHtml, /onkeydown="[^"]*copyCode\('[^']+'\)[^"]*"/u)
})

test('显式语言且可识别时必须输出标准高亮 DOM 契约', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const renderedHtml = md.render('```js\nconsole.log(1)\n```')
  const codeClassTokens = getCodeClassTokens(renderedHtml)
  const toolbarLangInfo = getToolbarLangInfo(renderedHtml)

  assert.match(renderedHtml, /<pre(?:\s[^>]*)?>\s*<code class="[^"]*\bhljs\b/u)
  assert.equal(codeClassTokens.has('hljs'), true)
  assert.equal(codeClassTokens.has('language-js'), true)
  assert.equal(codeClassTokens.has('language-javascript'), true)
  assert.match(renderedHtml, /pre-container-toolbar/u)
  assert.equal(toolbarLangInfo.classTokens.has('hidden'), false)
  assert.equal(toolbarLangInfo.text, 'js')
  assert.doesNotMatch(renderedHtml, /<pre class="[^"]*\bhljs\b/u)
  assert.doesNotMatch(renderedHtml, /\b(?:relative|absolute|top-0|right-0)\b/u)
})

test('显式语言但未识别时不得输出伪造的 language class 且仍显示原始标签', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const renderedHtml = md.render('```FooLang\nbody\n```')
  const codeClassTokens = getCodeClassTokens(renderedHtml)
  const toolbarLangInfo = getToolbarLangInfo(renderedHtml)

  assert.deepEqual([...codeClassTokens].sort(), ['hljs'])
  assert.doesNotMatch(renderedHtml, /\blanguage-[^"\s]+/u)
  assert.equal(toolbarLangInfo.classTokens.has('hidden'), false)
  assert.equal(toolbarLangInfo.text, 'FooLang')
})

test('未显式语言但自动识别成功时只输出检测出的 language class 且隐藏语言标签', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)
  const autoDetectFixture = getStableAutoDetectFixture()

  const renderedHtml = md.render(`\`\`\`\n${autoDetectFixture.code}\n\`\`\``)
  const codeClassTokens = getCodeClassTokens(renderedHtml)
  const toolbarLangInfo = getToolbarLangInfo(renderedHtml)

  assert.deepEqual([...codeClassTokens].sort(), ['hljs', `language-${autoDetectFixture.detectedLanguage}`].sort())
  assert.equal(toolbarLangInfo.classTokens.has('hidden'), true)
  assert.equal(toolbarLangInfo.text, '')
})

test('未显式语言且自动识别失败时只保留 hljs class 且隐藏语言标签', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const renderedHtml = md.render('```\n12345\n```')
  const codeClassTokens = getCodeClassTokens(renderedHtml)
  const toolbarLangInfo = getToolbarLangInfo(renderedHtml)

  assert.deepEqual([...codeClassTokens].sort(), ['hljs'])
  assert.equal(toolbarLangInfo.classTokens.has('hidden'), true)
  assert.equal(toolbarLangInfo.text, '')
})

test('mermaid fenced code block 必须保持独立分支输出', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const renderedHtml = md.render('```mermaid\ngraph TD\nA-->B\n```')

  assert.match(renderedHtml, /^<pre class="mermaid" data-code="graphTDA-->B"/u)
  assert.match(renderedHtml, />\s*graph TD\s*A-->B\s*<\/pre>/u)
  assert.doesNotMatch(renderedHtml, /pre-container-toolbar/u)
  assert.doesNotMatch(renderedHtml, /pre-container-copy/u)
  assert.doesNotMatch(renderedHtml, /\bhljs\b/u)
})
