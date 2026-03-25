import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

const GITHUB_THEME_STABLE_ROOT_SELECTOR = '.wj-preview-theme.preview-theme-github'

function resolveGithubThemePath() {
  return new URL('../preview-theme/theme/github.scss', import.meta.url)
}

function readGithubThemeSource() {
  const githubThemePath = resolveGithubThemePath()
  assert.equal(fs.existsSync(githubThemePath), true, 'github.scss 必须存在')
  return fs.readFileSync(githubThemePath, 'utf8')
}

function getSelectorBlocks(source, selector) {
  const selectorBlocks = []
  let searchIndex = 0

  while (searchIndex < source.length) {
    const selectorIndex = source.indexOf(selector, searchIndex)
    if (selectorIndex === -1) {
      break
    }

    const blockStart = source.indexOf('{', selectorIndex)
    assert.notEqual(blockStart, -1, `${selector} 缺少起始大括号`)

    let braceDepth = 0
    let blockEnd = -1

    for (let i = blockStart; i < source.length; i++) {
      const char = source[i]
      if (char === '{') {
        braceDepth++
        continue
      }
      if (char === '}') {
        braceDepth--
        if (braceDepth === 0) {
          blockEnd = i + 1
          selectorBlocks.push(source.slice(blockStart, blockEnd))
          searchIndex = blockEnd
          break
        }
      }
    }

    if (blockEnd === -1) {
      assert.fail(`${selector} 没有正确闭合`)
    }
  }

  assert.notEqual(selectorBlocks.length, 0, `未找到选择器：${selector}`)

  return selectorBlocks
}

function getTopLevelNestedRuleEntries(blockSource) {
  const blockBody = blockSource.slice(1, -1)
  const ruleEntries = []
  let braceDepth = 0
  let bracketDepth = 0
  let parenDepth = 0
  let tokenStart = 0
  let currentHeader = ''
  let currentBlockStart = -1
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let i = 0; i < blockBody.length; i++) {
    const currentChar = blockBody[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (currentChar === '\\') {
      escaped = true
      continue
    }

    if (!inDoubleQuote && currentChar === '\'') {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (!inSingleQuote && currentChar === '"') {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (inSingleQuote || inDoubleQuote) {
      continue
    }

    if (currentChar === '[') {
      bracketDepth++
      continue
    }

    if (currentChar === ']') {
      bracketDepth--
      continue
    }

    if (currentChar === '(') {
      parenDepth++
      continue
    }

    if (currentChar === ')') {
      parenDepth--
      continue
    }

    if (bracketDepth > 0 || parenDepth > 0) {
      continue
    }

    if (currentChar === '{') {
      if (braceDepth === 0) {
        currentHeader = blockBody.slice(tokenStart, i).trim()
        currentBlockStart = i
      }
      braceDepth++
      continue
    }

    if (currentChar === '}') {
      braceDepth--
      if (braceDepth === 0) {
        if (currentHeader) {
          ruleEntries.push({
            selectorHeader: currentHeader,
            blockSource: blockBody.slice(currentBlockStart, i + 1),
          })
        }
        tokenStart = i + 1
        currentHeader = ''
        currentBlockStart = -1
      }
      continue
    }

    if (braceDepth === 0 && currentChar === ';') {
      tokenStart = i + 1
    }
  }

  return ruleEntries
}

function normalizeSelectorHeader(selectorHeader) {
  return selectorHeader
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function findTopLevelNestedRuleEntry(source, selectorPattern, message) {
  const githubThemeBlocks = getSelectorBlocks(source, GITHUB_THEME_STABLE_ROOT_SELECTOR)

  for (const githubThemeBlock of githubThemeBlocks) {
    const matchedRuleEntry = getTopLevelNestedRuleEntries(githubThemeBlock)
      .find(({ selectorHeader }) => selectorPattern.test(normalizeSelectorHeader(selectorHeader)))

    if (matchedRuleEntry) {
      return matchedRuleEntry
    }
  }

  assert.fail(message)
}

function findNestedRuleEntry(blockSource, selectorPattern, message) {
  const matchedRuleEntry = getTopLevelNestedRuleEntries(blockSource)
    .find(({ selectorHeader }) => selectorPattern.test(normalizeSelectorHeader(selectorHeader)))

  assert.ok(matchedRuleEntry, message)

  return matchedRuleEntry
}

function assertGithubThemeRetainsNativeFormControlNormalization(source) {
  const formControlRuleEntry = findTopLevelNestedRuleEntry(
    source,
    /^:where\(button, input, optgroup, select, textarea\)$/u,
    'github 主题必须保留原生表单控件的字体与间距规范化规则',
  )
  assert.match(formControlRuleEntry.blockSource, /font:\s*inherit;/u)
  assert.match(formControlRuleEntry.blockSource, /margin:\s*0;/u)

  const buttonOverflowRuleEntry = findTopLevelNestedRuleEntry(
    source,
    /^:where\(button, input\)$/u,
    'github 主题必须保留 button 和 input 的 overflow 规范化规则',
  )
  assert.match(buttonOverflowRuleEntry.blockSource, /overflow:\s*visible;/u)

  const buttonAppearanceRuleEntry = findTopLevelNestedRuleEntry(
    source,
    /^:where\(button, \[type='button'\], \[type='reset'\], \[type='submit'\]\)$/u,
    'github 主题必须保留 button 类控件的 appearance 规范化规则',
  )
  assert.match(buttonAppearanceRuleEntry.blockSource, /-webkit-appearance:\s*button;/u)
  assert.match(buttonAppearanceRuleEntry.blockSource, /appearance:\s*button;/u)

  assert.doesNotMatch(
    source,
    /:where\(\[type='number'\]::-webkit-inner-spin-button,\s*\[type='number'\]::-webkit-outer-spin-button\)\s*\{/u,
    'github 主题的 number 输入控件 spin button 规则不能继续包在 :where(...) 里',
  )
  const numberSpinButtonRuleEntry = findTopLevelNestedRuleEntry(
    source,
    /^\[type='number'\]::-webkit-inner-spin-button, \[type='number'\]::-webkit-outer-spin-button$/u,
    'github 主题必须保留 number 输入控件 spin button 的有效选择器规则',
  )
  assert.match(numberSpinButtonRuleEntry.blockSource, /height:\s*auto;/u)

  assert.doesNotMatch(
    source,
    /:where\(\[type='search'\]::-webkit-search-cancel-button,\s*\[type='search'\]::-webkit-search-decoration\)\s*\{/u,
    'github 主题的 search 输入控件 webkit 规范化规则不能继续包在 :where(...) 里',
  )
  const searchDecorationRuleEntry = findTopLevelNestedRuleEntry(
    source,
    /^\[type='search'\]::-webkit-search-cancel-button, \[type='search'\]::-webkit-search-decoration$/u,
    'github 主题必须保留 search 输入控件 webkit 伪元素的有效选择器规则',
  )
  assert.match(searchDecorationRuleEntry.blockSource, /-webkit-appearance:\s*none;/u)
  assert.match(searchDecorationRuleEntry.blockSource, /appearance:\s*none;/u)
}

function assertGithubThemeRetainsRequiredSelectors(source) {
  findTopLevelNestedRuleEntry(
    source,
    /^details summary$/u,
    'github 主题必须保留 details summary 的交互呈现规则',
  )
  findTopLevelNestedRuleEntry(
    source,
    /^summary > :where\(h1, h2, h3, h4, h5, h6\)$/u,
    'github 主题必须保留 summary 标题行内化规则',
  )
  findTopLevelNestedRuleEntry(
    source,
    /^\.markdown-alert$/u,
    'github 主题必须保留 markdown alert 规则',
  )

  const taskListRuleEntry = findTopLevelNestedRuleEntry(
    source,
    /^\.task-list-item$/u,
    'github 主题必须保留任务列表规则',
  )
  findNestedRuleEntry(
    taskListRuleEntry.blockSource,
    /^label$/u,
    'github 主题必须保留任务列表 label 规则',
  )

  const footnotesRuleEntry = findTopLevelNestedRuleEntry(
    source,
    /^\.footnotes$/u,
    'github 主题必须保留脚注规则',
  )
  findNestedRuleEntry(
    footnotesRuleEntry.blockSource,
    /^li$/u,
    'github 主题必须保留脚注 li 规则',
  )

  const dataFootnoteRefRuleEntry = findTopLevelNestedRuleEntry(
    source,
    /^\[data-footnote-ref\]$/u,
    'github 主题必须保留脚注引用规则',
  )
  findNestedRuleEntry(
    dataFootnoteRefRuleEntry.blockSource,
    /^&::before$/u,
    'github 主题必须保留脚注引用前缀规则',
  )
}

test('github 预览主题迁移后必须移除已确认无效的历史规则', () => {
  const githubThemeSource = readGithubThemeSource()

  assert.equal(githubThemeSource.includes('preview-theme-github-light'), false)
  assert.equal(githubThemeSource.includes('.octicon'), false)
  assert.equal(githubThemeSource.includes('.pl-c'), false)
  assert.equal(githubThemeSource.includes('details-dialog'), false)
  assert.equal(githubThemeSource.includes('body:has(:modal)'), false)

  assertGithubThemeRetainsNativeFormControlNormalization(githubThemeSource)
  assertGithubThemeRetainsRequiredSelectors(githubThemeSource)
})
