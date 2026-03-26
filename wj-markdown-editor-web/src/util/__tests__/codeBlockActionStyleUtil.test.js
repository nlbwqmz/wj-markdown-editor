import assert from 'node:assert/strict'

const { test } = await import('node:test')

let codeBlockActionStyleUtilModule = null

try {
  codeBlockActionStyleUtilModule = await import('../codeBlockActionStyleUtil.js')
} catch {
  codeBlockActionStyleUtilModule = null
}

function requireCodeBlockActionStyleUtil() {
  assert.ok(codeBlockActionStyleUtilModule, '缺少 code block action style util')

  const {
    deriveCodeBlockActionVariables,
    syncCodeBlockActionVariables,
  } = codeBlockActionStyleUtilModule

  assert.equal(typeof deriveCodeBlockActionVariables, 'function')
  assert.equal(typeof syncCodeBlockActionVariables, 'function')

  return {
    deriveCodeBlockActionVariables,
    syncCodeBlockActionVariables,
  }
}

test('能从合法的 hljs 前景和背景派生结构层变量', () => {
  const { deriveCodeBlockActionVariables } = requireCodeBlockActionStyleUtil()
  const vars = deriveCodeBlockActionVariables({
    color: 'rgb(36, 41, 46)',
    backgroundColor: 'rgb(255, 255, 255)',
    backgroundImage: 'none',
  })

  assert.equal(typeof vars['--wj-code-block-action-fg'], 'string')
  assert.equal(typeof vars['--wj-code-block-action-fg-muted'], 'string')
  assert.equal(typeof vars['--wj-code-block-action-bg'], 'string')
  assert.equal(typeof vars['--wj-code-block-action-border'], 'string')
  assert.equal(typeof vars['--wj-code-block-action-shadow'], 'string')
  assert.notEqual(vars['--wj-code-block-action-bg'], 'rgba(0, 0, 0, 0.16)')
})

test('背景透明或采样失败时必须回退到安全值', () => {
  const { deriveCodeBlockActionVariables } = requireCodeBlockActionStyleUtil()
  const vars = deriveCodeBlockActionVariables({
    color: '',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
  })

  assert.deepEqual(vars, {
    '--wj-code-block-action-fg': 'rgba(255, 255, 255, 0.92)',
    '--wj-code-block-action-fg-muted': 'rgba(255, 255, 255, 0.72)',
    '--wj-code-block-action-bg': 'rgba(0, 0, 0, 0.16)',
    '--wj-code-block-action-border': 'rgba(255, 255, 255, 0.16)',
    '--wj-code-block-action-shadow': '0 1px 2px rgba(0, 0, 0, 0.18)',
  })
})

test('同步函数在重复调用时必须用最新 hljs 样式覆盖旧变量', () => {
  const { syncCodeBlockActionVariables } = requireCodeBlockActionStyleUtil()
  const styleStore = new Map()
  const previewRoot = {
    querySelector(selector) {
      return selector === '.hljs' ? {} : null
    },
    style: {
      setProperty(key, value) {
        styleStore.set(key, value)
      },
      getPropertyValue(key) {
        return styleStore.get(key) ?? ''
      },
    },
  }

  syncCodeBlockActionVariables(previewRoot, {
    getComputedStyle: () => ({
      color: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(28, 27, 27)',
      backgroundImage: 'none',
    }),
  })

  const firstValue = previewRoot.style.getPropertyValue('--wj-code-block-action-fg')

  syncCodeBlockActionVariables(previewRoot, {
    getComputedStyle: () => ({
      color: 'rgb(36, 41, 46)',
      backgroundColor: 'rgb(255, 255, 255)',
      backgroundImage: 'none',
    }),
  })

  assert.notEqual(
    previewRoot.style.getPropertyValue('--wj-code-block-action-fg'),
    firstValue,
  )
})

test('找不到 hljs 节点时也必须把默认变量写回预览根节点', () => {
  const { syncCodeBlockActionVariables } = requireCodeBlockActionStyleUtil()
  const styleStore = new Map()
  const previewRoot = {
    querySelector() {
      return null
    },
    style: {
      setProperty(key, value) {
        styleStore.set(key, value)
      },
      getPropertyValue(key) {
        return styleStore.get(key) ?? ''
      },
    },
  }

  syncCodeBlockActionVariables(previewRoot, {
    getComputedStyle: () => {
      throw new Error('不应读取不存在节点的计算样式')
    },
  })

  assert.equal(
    previewRoot.style.getPropertyValue('--wj-code-block-action-bg'),
    'rgba(0, 0, 0, 0.16)',
  )
})
