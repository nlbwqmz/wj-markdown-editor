import assert from 'node:assert/strict'

const { test } = await import('node:test')

let previewMermaidRenderUtilModule = null

try {
  previewMermaidRenderUtilModule = await import('../previewMermaidRenderUtil.js')
} catch {
  previewMermaidRenderUtilModule = null
}

function requireSettleMermaidRender() {
  assert.ok(previewMermaidRenderUtilModule, '缺少 preview mermaid render util')

  const { settleMermaidRender } = previewMermaidRenderUtilModule
  assert.equal(typeof settleMermaidRender, 'function')

  return settleMermaidRender
}

test('存在 mermaid 节点时，必须等待 run Promise 完成后再继续', async () => {
  const settleMermaidRender = requireSettleMermaidRender()
  const calls = []

  await settleMermaidRender({
    nodes: [{ id: 'm1' }],
    runMermaid: async (options) => {
      calls.push(options)
    },
    logError: () => {
      throw new Error('不应进入错误分支')
    },
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    nodes: [{ id: 'm1' }],
  })
})

test('mermaid 渲染失败时也必须收敛，不应阻塞后续导出', async () => {
  const settleMermaidRender = requireSettleMermaidRender()
  const errors = []

  await settleMermaidRender({
    nodes: [{ id: 'm2' }],
    runMermaid: async () => {
      throw new Error('render failed')
    },
    logError: (message, error) => {
      errors.push({ message, error })
    },
  })

  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /Mermaid/)
  assert.equal(errors[0].error.message, 'render failed')
})
