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

function getDarkThemeBlock(source) {
  const darkIndex = source.indexOf(`:root[theme='dark']`)
  assert.notEqual(darkIndex, -1, 'antd.scss 必须存在暗色主题块')

  return getBraceBlockByStartIndex(source, source.indexOf('{', darkIndex))
}

function getFirstRuleBlockBySelector(source, selector) {
  const selectorIndex = source.indexOf(selector)
  assert.notEqual(selectorIndex, -1, `未找到选择器：${selector}`)

  return getBraceBlockByStartIndex(source, source.indexOf('{', selectorIndex))
}

/**
 * 暗色下拉菜单禁用项的可见性约束。
 *
 * antd.scss 在 :root[theme='dark'] 里统一设置了菜单项文字颜色，
 * 那条规则的选择器优先级高于 ant-design-vue 自带的 disabled 样式，
 * 一旦这里的覆盖规则被删掉，禁用项会退化成和可用项完全一样的外观。
 */
test('暗色主题必须为下拉菜单禁用项提供覆盖规则', () => {
  const darkBlock = getDarkThemeBlock(readSource('../antd.scss'))

  assert.match(darkBlock, /\.ant-dropdown-menu-item-disabled/u)
  assert.match(darkBlock, /\.ant-dropdown-menu-submenu-title-disabled/u)
})

test('暗色禁用项必须降低不透明度并禁用指针', () => {
  const darkBlock = getDarkThemeBlock(readSource('../antd.scss'))
  const disabledRule = getFirstRuleBlockBySelector(darkBlock, '.ant-dropdown-menu-item-disabled')

  assert.match(disabledRule, /opacity:\s*0\.4/u)
  assert.match(disabledRule, /cursor:\s*not-allowed/u)
})

test('暗色禁用项不得保留 hover 背景反馈', () => {
  const darkBlock = getDarkThemeBlock(readSource('../antd.scss'))

  assert.match(darkBlock, /\.ant-dropdown-menu-item-disabled:hover/u)
  assert.match(darkBlock, /background-color:\s*transparent/u)
})
