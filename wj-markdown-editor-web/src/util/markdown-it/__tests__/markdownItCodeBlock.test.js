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

function countClassOccurrences(renderedHtml, className) {
  const pattern = new RegExp(`class="[^"]*\\b${className}\\b[^"]*"`, 'gu')
  return [...renderedHtml.matchAll(pattern)].length
}

function getSingleActionSlotToolbarStructure(renderedHtml) {
  const match = renderedHtml.match(
    /<div class="([^"]*\bpre-container-toolbar\b[^"]*)">\s*<div class="([^"]*\bpre-container-action-slot\b[^"]*)">\s*<div class="([^"]*\bpre-container-lang\b[^"]*)">([^<]*)<\/div>\s*<div class="([^"]*\bpre-container-copy\b[^"]*)"[^>]*><\/div>\s*<\/div>\s*<\/div>\s*<pre/u,
  )

  assert.ok(match, '显式语言代码块必须保持 toolbar -> action-slot -> lang/copy 的单槽位 DOM 结构')

  return {
    toolbarClassTokens: new Set(match[1].split(/\s+/u).filter(Boolean)),
    actionSlotClassTokens: new Set(match[2].split(/\s+/u).filter(Boolean)),
    langClassTokens: new Set(match[3].split(/\s+/u).filter(Boolean)),
    langText: match[4],
    copyClassTokens: new Set(match[5].split(/\s+/u).filter(Boolean)),
  }
}

function assertSingleActionSlotToolbarContract(renderedHtml) {
  const toolbarStructure = getSingleActionSlotToolbarStructure(renderedHtml)

  assert.equal(countClassOccurrences(renderedHtml, 'pre-container-toolbar'), 1)
  assert.equal(countClassOccurrences(renderedHtml, 'pre-container-action-slot'), 1)
  assert.equal(countClassOccurrences(renderedHtml, 'pre-container-lang'), 1)
  assert.equal(countClassOccurrences(renderedHtml, 'pre-container-copy'), 1)
  assert.equal(toolbarStructure.toolbarClassTokens.has('pre-container-toolbar'), true)
  assert.equal(toolbarStructure.actionSlotClassTokens.has('pre-container-action-slot'), true)
  assert.equal(toolbarStructure.langClassTokens.has('pre-container-lang'), true)
  assert.equal(toolbarStructure.copyClassTokens.has('pre-container-copy'), true)
  assert.doesNotMatch(renderedHtml, /<div class="[^"]*\bpre-container-toolbar\b[^"]*">\s*<div class="[^"]*\bpre-container-lang\b/u)
  assert.doesNotMatch(renderedHtml, /<div class="[^"]*\bpre-container-toolbar\b[^"]*">\s*<div class="[^"]*\bpre-container-copy\b/u)

  return toolbarStructure
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
  const toolbarStructure = assertSingleActionSlotToolbarContract(renderedHtml)

  assert.match(renderedHtml, /<pre(?:\s[^>]*)?>\s*<code class="[^"]*\bhljs\b/u)
  assert.equal(codeClassTokens.has('hljs'), true)
  assert.equal(codeClassTokens.has('language-js'), true)
  assert.equal(codeClassTokens.has('language-javascript'), true)
  assert.equal(toolbarLangInfo.classTokens.has('hidden'), false)
  assert.equal(toolbarLangInfo.text, 'js')
  assert.equal(toolbarStructure.langText, 'js')
  assert.doesNotMatch(renderedHtml, /<pre class="[^"]*\bhljs\b/u)
  assert.doesNotMatch(renderedHtml, /\b(?:relative|absolute|top-0|right-0)\b/u)
})

test('显式语言但未识别时不得输出伪造的 language class 且仍显示原始标签', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const renderedHtml = md.render('```FooLang\nbody\n```')
  const codeClassTokens = getCodeClassTokens(renderedHtml)
  const toolbarLangInfo = getToolbarLangInfo(renderedHtml)
  const toolbarStructure = assertSingleActionSlotToolbarContract(renderedHtml)

  assert.deepEqual([...codeClassTokens].sort(), ['hljs'])
  assert.doesNotMatch(renderedHtml, /\blanguage-[^"\s]+/u)
  assert.equal(toolbarLangInfo.classTokens.has('hidden'), false)
  assert.equal(toolbarLangInfo.text, 'FooLang')
  assert.equal(toolbarStructure.langText, 'FooLang')
})

test('普通 fenced code block 不得把正文语义色 utility class 写死到 DOM', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const renderedHtml = md.render('```js\nconsole.log(1)\n```')

  assert.doesNotMatch(renderedHtml, /var\(--wj-markdown-text-secondary\)/u)
})

test('未显式语言但自动识别成功时只输出检测出的 language class 且隐藏语言标签', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)
  const autoDetectFixture = getStableAutoDetectFixture()

  const renderedHtml = md.render(`\`\`\`\n${autoDetectFixture.code}\n\`\`\``)
  const codeClassTokens = getCodeClassTokens(renderedHtml)
  const toolbarLangInfo = getToolbarLangInfo(renderedHtml)
  const toolbarStructure = assertSingleActionSlotToolbarContract(renderedHtml)

  assert.deepEqual([...codeClassTokens].sort(), ['hljs', `language-${autoDetectFixture.detectedLanguage}`].sort())
  assert.equal(toolbarLangInfo.classTokens.has('hidden'), true)
  assert.equal(toolbarLangInfo.text, '')
  assert.equal(toolbarStructure.langText, '')
})

test('未显式语言且自动识别失败时只保留 hljs class 且隐藏语言标签', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)

  const renderedHtml = md.render('```\n12345\n```')
  const codeClassTokens = getCodeClassTokens(renderedHtml)
  const toolbarLangInfo = getToolbarLangInfo(renderedHtml)
  const toolbarStructure = assertSingleActionSlotToolbarContract(renderedHtml)

  assert.deepEqual([...codeClassTokens].sort(), ['hljs'])
  assert.equal(toolbarLangInfo.classTokens.has('hidden'), true)
  assert.equal(toolbarLangInfo.text, '')
  assert.equal(toolbarStructure.langText, '')
})

test('普通 fenced code block 在高亮抛错时仍必须输出稳定 shell 并安全转义代码内容', () => {
  const md = new MarkdownIt()
  md.use(codeBlockPlugin)
  const originalHighlightAuto = hljs.highlightAuto
  const originalConsoleError = console.error

  hljs.highlightAuto = () => {
    throw new Error('boom')
  }
  console.error = () => {}

  try {
    const renderedHtml = md.render('```\n<div>& unsafe\n```')
    const toolbarStructure = assertSingleActionSlotToolbarContract(renderedHtml)

    assert.match(renderedHtml, /pre-container/u)
    assert.match(renderedHtml, /pre-container-toolbar/u)
    assert.match(renderedHtml, /<pre(?:\s[^>]*)?>\s*<code class="[^"]*\bhljs\b/u)
    assert.match(renderedHtml, /&lt;div&gt;&amp; unsafe/u)
    assert.doesNotMatch(renderedHtml, /<pre><code><div>& unsafe/u)
    assert.equal(toolbarStructure.langText, '')
  } finally {
    hljs.highlightAuto = originalHighlightAuto
    console.error = originalConsoleError
  }
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
