import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const taskListIndentOverrideThemeFiles = [
  '../preview-theme/theme/github.scss',
  '../preview-theme/theme/juejin.scss',
  '../preview-theme/theme/vuepress.scss',
  '../preview-theme/theme/smart-blue.scss',
  '../preview-theme/theme/mk-cute.scss',
  '../preview-theme/theme/cyanosis.scss',
  '../preview-theme/theme/scrolls.scss',
]

test('任务列表父级缩进必须继承普通列表缩进，避免与普通列表混排时把圆点挤出可视区域', () => {
  const contractSource = readSource('../preview-theme/preview-theme-contract.scss')

  assert.match(
    contractSource,
    /--wj-preview-task-list-padding-inline-start:\s*var\(--wj-preview-list-padding-inline-start\);/u,
    '默认任务列表缩进必须继承普通列表缩进',
  )

  for (const relativePath of taskListIndentOverrideThemeFiles) {
    const themeSource = readSource(relativePath)
    const matchedLine = themeSource
      .split(/\r?\n/u)
      .find(line => line.includes('--wj-preview-task-list-padding-inline-start:'))

    assert.ok(matchedLine, `${relativePath} 必须显式声明任务列表缩进变量`)
    const matchedValue = matchedLine.split(':', 2)[1]?.trim().replace(/;$/u, '')
    assert.ok(matchedValue, `${relativePath} 的任务列表缩进变量格式不正确`)
    assert.equal(
      matchedValue,
      'var(--wj-preview-list-padding-inline-start)',
      `${relativePath} 的任务列表缩进必须与普通列表保持一致`,
    )
  }
})

test('任务列表 checkbox 必须通过自身尺寸补偿缩进，不能继续依赖父列表清零缩进', () => {
  const contractSource = readSource('../preview-theme/preview-theme-contract.scss')
  const baseSource = readSource('../preview-theme/preview-theme-base.scss')
  const githubThemeSource = readSource('../preview-theme/theme/github.scss')

  assert.match(
    contractSource,
    /--wj-preview-task-checkbox-size:\s*1em;/u,
    '默认任务列表 checkbox 必须声明稳定尺寸变量',
  )
  assert.match(
    contractSource,
    /--wj-preview-task-checkbox-offset-inline-start:\s*1\.4em;/u,
    '默认任务列表 checkbox 必须声明 marker 对齐偏移变量',
  )
  assert.match(
    contractSource,
    /--wj-preview-task-checkbox-gap:\s*0\.4em;/u,
    '默认任务列表 checkbox 必须声明文本间距变量',
  )
  assert.match(
    contractSource,
    /--wj-preview-task-checkbox-margin:\s*0\s+var\(--wj-preview-task-checkbox-gap\)\s+0\s+calc\(var\(--wj-preview-task-checkbox-offset-inline-start\)\s*\*\s*-1\);/u,
    '默认任务列表 checkbox 左侧补偿必须由独立的 marker 对齐偏移变量驱动',
  )
  assert.match(
    baseSource,
    /:where\(\.task-list-item-checkbox\)\s*\{[\s\S]*?inline-size:\s*var\(--wj-preview-task-checkbox-size\);[\s\S]*?block-size:\s*var\(--wj-preview-task-checkbox-size\);/u,
    '基础样式必须显式锁定任务列表 checkbox 尺寸，才能保证缩进补偿稳定生效',
  )
  assert.match(
    githubThemeSource,
    /--wj-preview-task-checkbox-gap:\s*0\.2em;/u,
    'github 主题必须保留较紧的任务列表文字间距',
  )
  assert.doesNotMatch(
    githubThemeSource,
    /--wj-preview-task-checkbox-offset-inline-start:/u,
    'github 主题不应单独覆盖任务列表 marker 对齐偏移，而应沿用稳定基线',
  )
})

test('github 主题必须在表单控件 margin 归零之后恢复任务列表 checkbox 的偏移样式', () => {
  const githubThemeSource = readSource('../preview-theme/theme/github.scss')
  const formControlNormalizationIndex = githubThemeSource.indexOf(':where(button, input, optgroup, select, textarea)')
  const taskCheckboxRuleMatch = githubThemeSource.match(/\.task-list-item-checkbox\s*\{[\s\S]*?margin:\s*var\(--wj-preview-task-checkbox-margin\);[\s\S]*?vertical-align:\s*var\(--wj-preview-task-checkbox-vertical-align\);[\s\S]*?\}/u)

  assert.notEqual(formControlNormalizationIndex, -1, 'github 主题必须保留表单控件 margin 归零规则')
  assert.ok(taskCheckboxRuleMatch, 'github 主题必须显式恢复任务列表 checkbox 的 margin 和 vertical-align')
  assert.ok(
    githubThemeSource.indexOf(taskCheckboxRuleMatch[0]) > formControlNormalizationIndex,
    'github 主题恢复任务列表 checkbox 偏移的规则必须位于表单控件归零规则之后',
  )
})
