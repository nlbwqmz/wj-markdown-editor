import assert from 'node:assert/strict'

const { test } = await import('node:test')

let recentMissingPromptControllerModule = null

try {
  recentMissingPromptControllerModule = await import('../recentMissingPromptController.js')
} catch {
  recentMissingPromptControllerModule = null
}

test('启动期先收到 push 再收到同一路径的首屏 snapshot 时，recent-missing 提示也只能出现一次', () => {
  assert.ok(recentMissingPromptControllerModule, '缺少 recent-missing 提示控制器')

  const { createRecentMissingPromptController } = recentMissingPromptControllerModule
  assert.equal(typeof createRecentMissingPromptController, 'function')

  const promptedPathList = []
  const controller = createRecentMissingPromptController({
    prompt(path) {
      promptedPathList.push(path)
    },
  })

  controller.sync({
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
  })
  controller.sync({
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
  })

  assert.deepEqual(promptedPathList, ['C:/docs/missing.md'])
})

test('recent-missing 状态解除后，再次进入同一路径缺失态时，必须允许重新提示', () => {
  assert.ok(recentMissingPromptControllerModule, '缺少 recent-missing 提示控制器')

  const { createRecentMissingPromptController } = recentMissingPromptControllerModule
  const promptedPathList = []
  const controller = createRecentMissingPromptController({
    prompt(path) {
      promptedPathList.push(path)
    },
  })

  controller.sync({
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
  })
  controller.sync({
    isRecentMissing: false,
    recentMissingPath: null,
  })
  controller.sync({
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/missing.md',
  })

  assert.deepEqual(promptedPathList, [
    'C:/docs/missing.md',
    'C:/docs/missing.md',
  ])
})

test('非 recent-missing snapshot 不得触发提示', () => {
  assert.ok(recentMissingPromptControllerModule, '缺少 recent-missing 提示控制器')

  const { createRecentMissingPromptController } = recentMissingPromptControllerModule
  const promptedPathList = []
  const controller = createRecentMissingPromptController({
    prompt(path) {
      promptedPathList.push(path)
    },
  })

  controller.sync({
    isRecentMissing: false,
    recentMissingPath: null,
  })

  assert.deepEqual(promptedPathList, [])
})

test('recentMissingPath 从 A 直接切到 B 时，两条路径都必须各提示一次', () => {
  assert.ok(recentMissingPromptControllerModule, '缺少 recent-missing 提示控制器')

  const { createRecentMissingPromptController } = recentMissingPromptControllerModule
  const promptedPathList = []
  const controller = createRecentMissingPromptController({
    prompt(path) {
      promptedPathList.push(path)
    },
  })

  controller.sync({
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/a.md',
  })
  controller.sync({
    isRecentMissing: true,
    recentMissingPath: 'C:/docs/b.md',
  })

  assert.deepEqual(promptedPathList, [
    'C:/docs/a.md',
    'C:/docs/b.md',
  ])
})
