import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function getBraceBlockByStartIndex(source, blockStart) {
  assert.notEqual(blockStart, -1, '缺少起始大括号')

  let braceDepth = 0

  for (let i = blockStart; i < source.length; i++) {
    const currentChar = source[i]
    if (currentChar === '{') {
      braceDepth++
      continue
    }
    if (currentChar === '}') {
      braceDepth--
      if (braceDepth === 0)
        return source.slice(blockStart, i + 1)
    }
  }

  assert.fail('样式块没有正确闭合')
}

function getSelectorBlock(source, selector) {
  const selectorIndex = source.indexOf(selector)
  assert.notEqual(selectorIndex, -1, `未找到选择器：${selector}`)

  const blockStart = source.indexOf('{', selectorIndex)
  return getBraceBlockByStartIndex(source, blockStart)
}

function getSharedWhereRule(source) {
  const whereMatch = /:where\((?<selectorList>[^)]*)\)\s*\{/u.exec(source)
  assert.ok(whereMatch, 'scroll.scss 必须存在 :where(...) 共享滚动条规则')

  const whereStart = source.indexOf('{', whereMatch.index)
  const block = getBraceBlockByStartIndex(source, whereStart)

  return {
    selectorList: whereMatch.groups.selectorList,
    block,
  }
}

function getPxVariableValue(block, variableName) {
  const variablePattern = new RegExp(`--${variableName}\\s*:\\s*(\\d+)px\\s*;`, 'u')
  const variableMatch = variablePattern.exec(block)
  assert.ok(variableMatch, `缺少变量 --${variableName}`)
  return Number(variableMatch[1])
}

test('scroll.scss 必须集中定义共享滚动条变量并覆盖 wj-scrollbar 与 CodeMirror 滚动层', () => {
  const source = readSource('../scroll.scss')
  const sharedWhereRule = getSharedWhereRule(source)
  const normalizedSelectorList = sharedWhereRule.selectorList
    .split(',')
    .map(selector => selector.trim())

  assert.deepEqual(
    normalizedSelectorList,
    ['.wj-scrollbar', '.wj-scrollbar *', '.cm-editor .cm-scroller', '.cm-editor .cm-scroller *'],
    'scroll.scss 的共享规则必须同时覆盖 .wj-scrollbar 与 .cm-editor .cm-scroller（含子元素）',
  )

  const hitSize = getPxVariableValue(sharedWhereRule.block, 'wj-scrollbar-hit-size')
  const idleBorder = getPxVariableValue(sharedWhereRule.block, 'wj-scrollbar-thumb-border-idle')
  const activeBorder = getPxVariableValue(sharedWhereRule.block, 'wj-scrollbar-thumb-border-active')

  assert.ok(hitSize > 0, 'scroll.scss 的 --wj-scrollbar-hit-size 必须是正数')
  assert.ok(
    idleBorder > activeBorder,
    'scroll.scss 必须满足粗态前提：--wj-scrollbar-thumb-border-idle 的数值大于 --wj-scrollbar-thumb-border-active',
  )

  assert.match(
    sharedWhereRule.block,
    /&::-webkit-scrollbar\s*\{/u,
    'scroll.scss 的共享规则中必须包含 ::-webkit-scrollbar 样式',
  )
  assert.match(
    sharedWhereRule.block,
    /&::-webkit-scrollbar-track\s*\{/u,
    'scroll.scss 的共享规则中必须包含 ::-webkit-scrollbar-track 样式',
  )
  assert.match(
    sharedWhereRule.block,
    /&::-webkit-scrollbar-thumb\s*\{/u,
    'scroll.scss 的共享规则中必须包含 ::-webkit-scrollbar-thumb 样式',
  )
})

test('scroll.scss 必须使用固定命中区 + 透明 border 的细粗态方案，并通过真实滚动条 hover 触发轨道显示', () => {
  const source = readSource('../scroll.scss')
  const sharedWhereRule = getSharedWhereRule(source)
  const sharedRuleBlock = sharedWhereRule.block
  const scrollbarHoverBlock = getSelectorBlock(sharedRuleBlock, '&::-webkit-scrollbar:hover')
  const thumbHoverBlock = getSelectorBlock(sharedRuleBlock, '&::-webkit-scrollbar-thumb:hover')
  const thumbActiveBlock = getSelectorBlock(sharedRuleBlock, '&::-webkit-scrollbar-thumb:active')

  assert.match(
    sharedRuleBlock,
    /&::-webkit-scrollbar\s*\{[\s\S]*?width\s*:\s*var\(--wj-scrollbar-hit-size\)\s*;[\s\S]*?height\s*:\s*var\(--wj-scrollbar-hit-size\)\s*;/u,
    'scroll.scss 必须定义滚动条真实命中区变量 --wj-scrollbar-hit-size',
  )
  assert.match(
    sharedRuleBlock,
    /&::-webkit-scrollbar-track\s*\{[\s\S]*?background-color\s*:\s*transparent\s*;/u,
    'scroll.scss 默认必须隐藏轨道（track 透明）',
  )
  assert.match(
    sharedRuleBlock,
    /&::-webkit-scrollbar-corner\s*\{[\s\S]*?background-color\s*:\s*transparent\s*;/u,
    'scroll.scss 默认必须隐藏 corner（corner 透明）',
  )
  assert.match(
    sharedRuleBlock,
    /&::-webkit-scrollbar-thumb\s*\{[\s\S]*?border\s*:\s*var\(--wj-scrollbar-thumb-border-idle\)\s+solid\s+transparent\s*;[\s\S]*?background-clip\s*:\s*content-box\s*;/u,
    'scroll.scss 默认细态必须使用透明 border + background-clip: content-box',
  )
  assert.match(
    scrollbarHoverBlock,
    /background-color\s*:\s*var\(--wj-markdown-scroll-bg\)\s*;/u,
    'scroll.scss 必须在 ::-webkit-scrollbar:hover 命中时显示轨道',
  )
  assert.doesNotMatch(
    sharedRuleBlock,
    /::-webkit-scrollbar:hover::-webkit-scrollbar-thumb/u,
    'scroll.scss 不得使用 ::-webkit-scrollbar:hover::-webkit-scrollbar-thumb 这类无效链式 pseudo-element 选择器',
  )
  assert.match(
    thumbHoverBlock,
    /border\s*:\s*var\(--wj-scrollbar-thumb-border-active\)\s+solid\s+transparent\s*;/u,
    'scroll.scss 必须在 thumb:hover 时使用 active border 以保留粗态',
  )
  assert.match(
    thumbActiveBlock,
    /border\s*:\s*var\(--wj-scrollbar-thumb-border-active\)\s+solid\s+transparent\s*;/u,
    'scroll.scss 必须在 thumb:active 时使用 active border 以保留粗态',
  )
})

test('editorExtensionUtil.js 只保留 cm-scroller 布局规则，不得继续内联 webkit 滚动条主题规则', () => {
  const source = readSource('../../../util/editor/editorExtensionUtil.js')

  assert.match(
    source,
    /\.cm-scroller':\s*\{[\s\S]*?overflowY:\s*'scroll'/u,
    'editorExtensionUtil.js 必须保留 .cm-scroller 的布局滚动规则',
  )
  assert.doesNotMatch(
    source,
    /\*::-webkit-scrollbar/u,
    'editorExtensionUtil.js 不得继续内联 *::-webkit-scrollbar 规则',
  )
  assert.doesNotMatch(
    source,
    /::-webkit-scrollbar-track/u,
    'editorExtensionUtil.js 不得继续内联 ::-webkit-scrollbar-track 规则',
  )
  assert.doesNotMatch(
    source,
    /::-webkit-scrollbar-thumb/u,
    'editorExtensionUtil.js 不得继续内联 ::-webkit-scrollbar-thumb 规则',
  )
})
