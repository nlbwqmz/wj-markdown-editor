import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function resolveGithubThemePath() {
  return new URL('../preview-theme/theme/github.scss', import.meta.url)
}

function readGithubThemeSource() {
  const githubThemePath = resolveGithubThemePath()
  assert.equal(fs.existsSync(githubThemePath), true, 'github.scss 必须存在')
  return fs.readFileSync(githubThemePath, 'utf8')
}

function getSelectorBlock(source, selectorRegex, message) {
  const matchedBlock = source.match(selectorRegex)?.[0]
  assert.ok(matchedBlock, message)
  return matchedBlock
}

function assertGithubThemeRetainsNativeFormControlNormalization(source) {
  const formControlBlock = getSelectorBlock(
    source,
    /\.preview-theme-github\s+:where\(button,\s*input,\s*optgroup,\s*select,\s*textarea\)\s*\{[\s\S]*?\}/u,
    'github 主题必须保留原生表单控件的字体与间距规范化规则',
  )
  assert.match(formControlBlock, /font:\s*inherit;/u)
  assert.match(formControlBlock, /margin:\s*0;/u)

  const buttonOverflowBlock = getSelectorBlock(
    source,
    /\.preview-theme-github\s+:where\(button,\s*input\)\s*\{[\s\S]*?\}/u,
    'github 主题必须保留 button 和 input 的 overflow 规范化规则',
  )
  assert.match(buttonOverflowBlock, /overflow:\s*visible;/u)

  const buttonAppearanceBlock = getSelectorBlock(
    source,
    /\.preview-theme-github\s+:where\(button,\s*\[type='button'\],\s*\[type='reset'\],\s*\[type='submit'\]\)\s*\{[\s\S]*?\}/u,
    'github 主题必须保留 button 类控件的 appearance 规范化规则',
  )
  assert.match(buttonAppearanceBlock, /-webkit-appearance:\s*button;/u)
  assert.match(buttonAppearanceBlock, /appearance:\s*button;/u)

  assert.doesNotMatch(
    source,
    /\.preview-theme-github\s+:where\(\[type='number'\]::-webkit-inner-spin-button,\s*\[type='number'\]::-webkit-outer-spin-button\)\s*\{/u,
    'github 主题的 number 输入控件 spin button 规则不能继续包在 :where(...) 里',
  )
  assert.match(
    source,
    /\.preview-theme-github\s+\[type='number'\]::-webkit-inner-spin-button,\s*\.preview-theme-github\s+\[type='number'\]::-webkit-outer-spin-button\s*\{[\s\S]*?height:\s*auto;[\s\S]*?\}/u,
    'github 主题必须保留 number 输入控件 spin button 的有效选择器规则',
  )

  assert.doesNotMatch(
    source,
    /\.preview-theme-github\s+:where\(\[type='search'\]::-webkit-search-cancel-button,\s*\[type='search'\]::-webkit-search-decoration\)\s*\{/u,
    'github 主题的 search 输入控件 webkit 规范化规则不能继续包在 :where(...) 里',
  )
  assert.match(
    source,
    /\.preview-theme-github\s+\[type='search'\]::-webkit-search-cancel-button,\s*\.preview-theme-github\s+\[type='search'\]::-webkit-search-decoration\s*\{[\s\S]*?-webkit-appearance:\s*none;[\s\S]*?appearance:\s*none;[\s\S]*?\}/u,
    'github 主题必须保留 search 输入控件 webkit 伪元素的有效选择器规则',
  )
}

function assertGithubThemeRetainsRequiredSelectors(source) {
  assert.match(source, /\.preview-theme-github\s+details\s+summary\s*\{/u)
  assert.match(source, /\.preview-theme-github\s+summary\s*>\s*:where\(h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\)\s*\{/u)
  assert.match(source, /\.preview-theme-github\s+\.markdown-alert\s*\{/u)
  assert.match(source, /\.preview-theme-github\s+\.task-list-item\s+label\s*\{/u)
  assert.match(source, /\.preview-theme-github\s+\.footnotes\s+li\s*\{/u)
  assert.match(source, /\.preview-theme-github\s+\[data-footnote-ref\]::before\s*\{/u)
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
