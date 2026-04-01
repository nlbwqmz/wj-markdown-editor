import assert from 'node:assert/strict'

const { test } = await import('node:test')

let documentOpenInteractionServiceModule = null

try {
  documentOpenInteractionServiceModule = await import('../documentOpenInteractionService.js')
} catch {
  documentOpenInteractionServiceModule = null
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

test('open dialog 未返回路径时，应返回结构化 cancelled 结果', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    createDocumentOpenInteractionService,
  } = documentOpenInteractionServiceModule

  const service = createDocumentOpenInteractionService({
    requestDocumentOpenDialog: async () => null,
  })

  const result = await service.requestDocumentOpenByDialog()

  assert.deepEqual(result, {
    ok: false,
    reason: 'cancelled',
    path: null,
  })
})

test('open dialog 选中文件时，应返回结构化 selected 结果', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    createDocumentOpenInteractionService,
  } = documentOpenInteractionServiceModule

  const service = createDocumentOpenInteractionService({
    requestDocumentOpenDialog: async () => 'D:/docs/next.md',
  })

  const result = await service.requestDocumentOpenByDialog()

  assert.deepEqual(result, {
    ok: true,
    reason: 'selected',
    path: 'D:/docs/next.md',
  })
})

test('open dialog 返回主进程结构化 selected 结果时，应原样透传 path', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    createDocumentOpenInteractionService,
  } = documentOpenInteractionServiceModule

  const service = createDocumentOpenInteractionService({
    requestDocumentOpenDialog: async () => ({
      ok: true,
      reason: 'selected',
      path: 'D:/docs/from-dialog.md',
    }),
  })

  const result = await service.requestDocumentOpenByDialog()

  assert.deepEqual(result, {
    ok: true,
    reason: 'selected',
    path: 'D:/docs/from-dialog.md',
  })
})

test('未注册宿主打开处理器时，应返回结构化 unavailable 结果', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    createDocumentOpenInteractionService,
  } = documentOpenInteractionServiceModule

  const service = createDocumentOpenInteractionService({
    requestDocumentOpenDialog: async () => 'D:/docs/next.md',
  })

  const result = await service.requestDocumentOpenPath('D:/docs/next.md')

  assert.deepEqual(result, {
    ok: false,
    reason: 'interaction-unavailable',
    path: 'D:/docs/next.md',
  })
})

test('通过 setOpenHandler 注册 handler 后，应调用该 handler 并返回结构化结果', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    createDocumentOpenInteractionService,
  } = documentOpenInteractionServiceModule

  const service = createDocumentOpenInteractionService({
    requestDocumentOpenDialog: async () => null,
  })
  const openHandler = test.mock.fn(async ({ path, entrySource }) => ({
    ok: true,
    reason: 'opened',
    path,
    entrySource,
  }))

  const unregister = service.setOpenHandler(openHandler)
  const result = await service.requestDocumentOpenPath('D:/docs/next.md', {
    entrySource: 'file-manager',
  })

  assert.equal(openHandler.mock.callCount(), 1)
  assert.deepEqual({
    path: openHandler.mock.calls[0].arguments[0].path,
    entrySource: openHandler.mock.calls[0].arguments[0].entrySource,
  }, {
    path: 'D:/docs/next.md',
    entrySource: 'file-manager',
  })
  assert.deepEqual(result, {
    ok: true,
    reason: 'opened',
    path: 'D:/docs/next.md',
    entrySource: 'file-manager',
  })

  unregister()
})

test('统一打开交互 handler 必须收到活动态检查与弹窗销毁注册能力', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    createDocumentOpenInteractionService,
  } = documentOpenInteractionServiceModule

  let receivedOptions = null
  const service = createDocumentOpenInteractionService()
  service.setOpenHandler(async (options) => {
    receivedOptions = options
    return {
      ok: true,
      reason: 'opened',
      path: options.path,
    }
  })

  await service.requestDocumentOpenPath('D:/docs/next.md', {
    entrySource: 'recent',
    trigger: 'user',
  })

  assert.equal(typeof receivedOptions?.isInteractionActive, 'function')
  assert.equal(typeof receivedOptions?.setActiveDialogDestroyer, 'function')
  assert.equal(receivedOptions.isInteractionActive(), true)
})

test('新一轮打开请求开始时，必须让上一轮交互 promise 失效并销毁旧弹窗', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    createDocumentOpenInteractionService,
  } = documentOpenInteractionServiceModule

  const firstDeferred = createDeferred()
  const secondDeferred = createDeferred()
  const destroyActiveDialog = test.mock.fn()
  const performOpen = test.mock.fn(async ({ path }) => {
    if (path === 'D:/docs/first.md') {
      return await firstDeferred.promise
    }

    return await secondDeferred.promise
  })

  const service = createDocumentOpenInteractionService({
    requestDocumentOpenDialog: async () => null,
    performOpen,
    destroyActiveDialog,
  })

  const previousRequestPromise = service.requestDocumentOpenPath('D:/docs/first.md')
  const nextRequestPromise = service.requestDocumentOpenPath('D:/docs/second.md')

  secondDeferred.resolve({
    ok: true,
    reason: 'opened',
    path: 'D:/docs/second.md',
  })

  await assert.rejects(previousRequestPromise, {
    reason: 'request-invalidated',
  })
  assert.equal(destroyActiveDialog.mock.callCount(), 1)
  assert.deepEqual(await nextRequestPromise, {
    ok: true,
    reason: 'opened',
    path: 'D:/docs/second.md',
  })
})

test('invalidateActiveRequest 必须销毁当前请求注册的弹窗 destroyer', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    createDocumentOpenInteractionService,
  } = documentOpenInteractionServiceModule

  const deferred = createDeferred()
  const dialogDestroyer = test.mock.fn()
  const service = createDocumentOpenInteractionService()
  service.setOpenHandler(async ({ setActiveDialogDestroyer }) => {
    setActiveDialogDestroyer(dialogDestroyer)
    return await deferred.promise
  })

  const requestPromise = service.requestDocumentOpenPath('D:/docs/next.md')
  await Promise.resolve()

  service.invalidateActiveRequest()

  assert.equal(dialogDestroyer.mock.callCount(), 1)
  await assert.rejects(requestPromise, {
    reason: 'request-invalidated',
  })
})

test('模块级 requestDocumentOpenByDialogAndOpen 在弹系统文件选择框前，必须先作废上一轮打开请求', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    createDocumentOpenInteractionService,
    registerDocumentOpenInteractionService,
    requestDocumentOpenByDialogAndOpen,
  } = documentOpenInteractionServiceModule

  const previousOpenDeferred = createDeferred()
  const dialogDeferred = createDeferred()
  const dialogDestroyer = test.mock.fn()
  const service = createDocumentOpenInteractionService({
    requestDocumentOpenDialog: async () => await dialogDeferred.promise,
  })
  service.setOpenHandler(async ({ setActiveDialogDestroyer }) => {
    setActiveDialogDestroyer(dialogDestroyer)
    return await previousOpenDeferred.promise
  })

  const previousRequestPromise = service.requestDocumentOpenPath('D:/docs/first.md')
  let previousRequestState = null
  previousRequestPromise.catch((error) => {
    previousRequestState = error?.reason || 'rejected'
  })

  const cleanup = registerDocumentOpenInteractionService(service)

  try {
    const dialogAndOpenPromise = requestDocumentOpenByDialogAndOpen({
      entrySource: 'menu-open-file',
      trigger: 'user',
    })

    await Promise.resolve()
    await Promise.resolve()

    assert.equal(previousRequestState, 'request-invalidated')
    assert.equal(dialogDestroyer.mock.callCount(), 1)
    await assert.rejects(previousRequestPromise, {
      reason: 'request-invalidated',
    })

    dialogDeferred.resolve({
      ok: false,
      reason: 'cancelled',
      path: null,
    })

    const result = await dialogAndOpenPromise

    assert.deepEqual(result, {
      ok: false,
      reason: 'cancelled',
      path: null,
    })
  } finally {
    cleanup()
  }
})

test('模块级 requestDocumentOpenPathByInteraction 必须把 request-invalidated 吃成结构化结果', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    registerDocumentOpenInteractionService,
    requestDocumentOpenPathByInteraction,
  } = documentOpenInteractionServiceModule

  const cleanup = registerDocumentOpenInteractionService({
    requestDocumentOpenPath: async () => {
      const error = new Error('request-invalidated')
      error.ok = false
      error.reason = 'request-invalidated'
      throw error
    },
  })

  try {
    const result = await requestDocumentOpenPathByInteraction('D:/docs/next.md', {
      entrySource: 'recent',
      trigger: 'user',
    })

    assert.deepEqual(result, {
      ok: false,
      reason: 'request-invalidated',
      path: 'D:/docs/next.md',
    })
  } finally {
    cleanup()
  }
})

test('模块级 requestDocumentOpenByDialogAndOpen 必须把 request-invalidated 吃成结构化结果', async () => {
  assert.ok(documentOpenInteractionServiceModule, '缺少统一打开交互 service')

  const {
    registerDocumentOpenInteractionService,
    requestDocumentOpenByDialogAndOpen,
  } = documentOpenInteractionServiceModule

  const cleanup = registerDocumentOpenInteractionService({
    requestDocumentOpenByDialog: async () => ({
      ok: true,
      reason: 'selected',
      path: 'D:/docs/from-dialog.md',
    }),
    requestDocumentOpenPath: async () => {
      const error = new Error('request-invalidated')
      error.ok = false
      error.reason = 'request-invalidated'
      throw error
    },
  })

  try {
    const result = await requestDocumentOpenByDialogAndOpen({
      entrySource: 'shortcut-open-file',
      trigger: 'user',
    })

    assert.deepEqual(result, {
      ok: false,
      reason: 'request-invalidated',
      path: 'D:/docs/from-dialog.md',
    })
  } finally {
    cleanup()
  }
})
