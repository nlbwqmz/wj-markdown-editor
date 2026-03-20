import { describe, expect, it, vi } from 'vitest'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolveInner, rejectInner) => {
    resolve = resolveInner
    reject = rejectInner
  })
  return {
    promise,
    resolve,
    reject,
  }
}

async function createServiceContext() {
  const dialogApi = {
    showOpenDialogSync: vi.fn(),
  }
  const showMock = vi.fn()
  const notificationApi = {
    isSupported: vi.fn(() => false),
  }
  const fsModule = {
    pathExists: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
  }
  const recentStore = {
    add: vi.fn(),
    get: vi.fn(() => []),
    remove: vi.fn(),
    clear: vi.fn(),
  }
  const resourceUtil = {
    getLocalResourceInfo: vi.fn(),
    getLocalResourceComparableKey: vi.fn(),
  }

  const { createDocumentEffectService } = await import('../documentEffectService.js')
  const service = createDocumentEffectService({
    dialogApi,
    fsModule,
    recentStore,
    resourceUtil,
    notificationApi,
    createSystemNotification: showMock,
  })

  return {
    service,
    dialogApi,
    fsModule,
    recentStore,
    resourceUtil,
    notificationApi,
    showMock,
  }
}

function createEffectHostControllers(overrides = {}) {
  return {
    closeHostController: {
      requestForceClose: vi.fn(),
      continueWindowClose: vi.fn(async () => true),
      finalizeWindowClose: vi.fn(),
      getClosedManualRequestCompletions: vi.fn(() => []),
      ...overrides.closeHostController,
    },
    externalWatchController: {
      start: vi.fn(),
      stop: vi.fn(),
      getContext: vi.fn(() => ({
        bindingToken: null,
        watchingPath: null,
        shouldRebindAfterSave: false,
      })),
      markInternalSave: vi.fn(),
      settlePendingChange: vi.fn(),
      ignorePendingChange: vi.fn(),
      ...overrides.externalWatchController,
    },
    windowMessageController: {
      publishWindowMessage: vi.fn(),
      publishSnapshotChanged: vi.fn(),
      ...overrides.windowMessageController,
    },
  }
}

describe('documentEffectService', () => {
  it('document.request-open-dialog 选中文件时，必须通过 dialog.open-target-selected 回流', async () => {
    const { service, dialogApi } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({ ok: true })

    dialogApi.showOpenDialogSync.mockReturnValue(['C:/docs/demo.md'])

    await service.executeCommand({
      command: 'document.request-open-dialog',
      dispatchCommand,
    })

    expect(dispatchCommand).toHaveBeenCalledWith('dialog.open-target-selected', {
      path: 'C:/docs/demo.md',
    })
  })

  it('document.request-open-dialog 取消时，必须通过 dialog.open-target-cancelled 回流', async () => {
    const { service, dialogApi } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({ ok: false })

    dialogApi.showOpenDialogSync.mockReturnValue(undefined)

    await service.executeCommand({
      command: 'document.request-open-dialog',
      dispatchCommand,
    })

    expect(dispatchCommand).toHaveBeenCalledWith('dialog.open-target-cancelled')
  })

  it('dialog.open-target-selected 命中存在但非 .md 的路径时，必须拦截并返回 invalid-extension', async () => {
    const { service, fsModule } = await createServiceContext()
    const openDocumentWindow = vi.fn()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })

    const result = await service.executeCommand({
      command: 'dialog.open-target-selected',
      payload: {
        path: 'C:/docs/plain.txt',
      },
      openDocumentWindow,
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-invalid-extension',
      path: 'C:/docs/plain.txt',
    })
    expect(openDocumentWindow).not.toHaveBeenCalled()
  })

  it('document.open-path 命中相对路径时，必须先按 baseDir 解析成稳定绝对路径，再进入统一 opening policy', async () => {
    const { service, fsModule } = await createServiceContext()
    const openDocumentWindow = vi.fn().mockResolvedValue({
      ok: true,
      reason: 'opened',
    })
    const resolvedPath = 'D:/workspace-root/docs/demo.md'

    fsModule.pathExists.mockImplementation(async targetPath => targetPath === resolvedPath)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })

    const result = await service.executeCommand({
      command: 'document.open-path',
      payload: {
        path: 'docs/demo.md',
        baseDir: 'D:/workspace-root',
        trigger: 'second-instance',
      },
      openDocumentWindow,
    })

    expect(openDocumentWindow).toHaveBeenCalledWith(resolvedPath, {
      isRecent: false,
      trigger: 'second-instance',
    })
    expect(result).toEqual({
      ok: true,
      reason: 'opened',
    })
  })

  it('document.open-recent(trigger=user) 命中缺失文件时，不能改动当前 active session', async () => {
    const { service, fsModule } = await createServiceContext()
    const openDocumentWindow = vi.fn()
    const activateRecentMissingSession = vi.fn()

    fsModule.pathExists.mockResolvedValue(false)

    const result = await service.executeCommand({
      command: 'document.open-recent',
      payload: {
        path: 'C:/docs/missing.md',
        trigger: 'user',
      },
      openDocumentWindow,
      activateRecentMissingSession,
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-recent-target-missing',
      path: 'C:/docs/missing.md',
    })
    expect(openDocumentWindow).not.toHaveBeenCalled()
    expect(activateRecentMissingSession).not.toHaveBeenCalled()
  })

  it('document.open-recent 命中存在但非 .md 的路径时，user/startup 两条入口都必须统一拦截', async () => {
    const { service, fsModule } = await createServiceContext()
    const openDocumentWindow = vi.fn()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })

    const userResult = await service.executeCommand({
      command: 'document.open-recent',
      payload: {
        path: 'C:/docs/plain.txt',
        trigger: 'user',
      },
      openDocumentWindow,
    })
    const startupResult = await service.executeCommand({
      command: 'document.open-recent',
      payload: {
        path: 'C:/docs/plain.txt',
        trigger: 'startup',
      },
      openDocumentWindow,
    })

    expect(userResult).toEqual({
      ok: false,
      reason: 'open-target-invalid-extension',
      path: 'C:/docs/plain.txt',
    })
    expect(startupResult).toEqual({
      ok: false,
      reason: 'open-target-invalid-extension',
      path: 'C:/docs/plain.txt',
    })
    expect(openDocumentWindow).not.toHaveBeenCalled()
  })

  it('opening policy 必须要求目标是“存在的 Markdown 文件”，不能放行以 .md 结尾的目录', async () => {
    const { service, fsModule } = await createServiceContext()
    const openDocumentWindow = vi.fn()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => false,
    })

    const dialogResult = await service.executeCommand({
      command: 'dialog.open-target-selected',
      payload: {
        path: 'C:/docs/folder.md',
      },
      openDocumentWindow,
    })
    const recentResult = await service.executeCommand({
      command: 'document.open-recent',
      payload: {
        path: 'C:/docs/folder.md',
        trigger: 'startup',
      },
      openDocumentWindow,
    })

    expect(dialogResult).toEqual({
      ok: false,
      reason: 'open-target-not-file',
      path: 'C:/docs/folder.md',
    })
    expect(recentResult).toEqual({
      ok: false,
      reason: 'open-target-not-file',
      path: 'C:/docs/folder.md',
    })
    expect(openDocumentWindow).not.toHaveBeenCalled()
  })

  it('document.open-recent(trigger=startup) 命中缺失文件时，会创建 recent-missing 会话', async () => {
    const { service, fsModule } = await createServiceContext()
    const openDocumentWindow = vi.fn(async (filePath) => {
      return {
        ok: true,
        snapshot: {
          sessionId: 'recent-missing-session',
          displayPath: filePath,
          recentMissingPath: filePath,
          isRecentMissing: true,
        },
      }
    })

    fsModule.pathExists.mockResolvedValue(false)

    const result = await service.executeCommand({
      command: 'document.open-recent',
      payload: {
        path: 'C:/docs/missing.md',
        trigger: 'startup',
      },
      openDocumentWindow,
    })

    expect(openDocumentWindow).toHaveBeenCalledWith('C:/docs/missing.md', {
      isRecent: true,
      trigger: 'startup',
    })
    expect(result.snapshot.isRecentMissing).toBe(true)
    expect(result.snapshot.recentMissingPath).toBe('C:/docs/missing.md')
  })

  it('recent.clear 在列表本来就是空时，不应触发真实清空副作用', async () => {
    const { service, recentStore } = await createServiceContext()

    recentStore.get.mockReturnValue([])

    const result = await service.executeCommand({
      command: 'recent.clear',
    })

    expect(result).toEqual({
      ok: true,
      changed: false,
      list: [],
    })
    expect(recentStore.clear).not.toHaveBeenCalled()
  })

  it('recent.remove 命中不存在的路径时，必须保持幂等且不触发真实删除副作用', async () => {
    const { service, recentStore } = await createServiceContext()
    recentStore.get.mockReturnValue([
      {
        name: 'demo.md',
        path: 'C:/docs/demo.md',
      },
    ])

    const result = await service.executeCommand({
      command: 'recent.remove',
      payload: {
        path: 'C:/docs/missing.md',
      },
    })

    expect(result).toEqual({
      ok: true,
      changed: false,
      list: [
        {
          name: 'demo.md',
          path: 'C:/docs/demo.md',
        },
      ],
    })
    expect(recentStore.remove).not.toHaveBeenCalled()
  })

  it('resource.get-info / resource.get-comparable-key 不应继续由 effectService 处理，避免绕过 documentResourceService', async () => {
    const { service, resourceUtil } = await createServiceContext()

    await expect(service.executeCommand({
      command: 'resource.get-info',
      payload: {
        resourceUrl: 'wj://2e2f6173736574732f64656d6f2e706e67',
      },
      winInfo: {
        path: 'C:/docs/demo.md',
      },
    })).rejects.toThrow('未知副作用命令: resource.get-info')

    await expect(service.executeCommand({
      command: 'resource.get-comparable-key',
      payload: {
        rawPath: './assets/demo.png',
      },
      winInfo: {
        path: 'C:/docs/demo.md',
      },
    })).rejects.toThrow('未知副作用命令: resource.get-comparable-key')

    expect(resourceUtil.getLocalResourceInfo).not.toHaveBeenCalled()
    expect(resourceUtil.getLocalResourceComparableKey).not.toHaveBeenCalled()
  })

  it('writeFile 已成功时，即使 recent.add 失败，也必须继续回流 save.succeeded，不能把真实保存误判成失败', async () => {
    const { service, fsModule, recentStore } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({})
    const { externalWatchController } = createEffectHostControllers()

    fsModule.writeFile.mockResolvedValue(undefined)
    recentStore.add.mockRejectedValue(new Error('recent store unavailable'))

    await service.applyEffect({
      effect: {
        type: 'execute-save',
        job: {
          jobId: 'save-job-1',
          path: 'C:/docs/demo.md',
          content: '# demo',
          revision: 3,
          trigger: 'manual-save',
        },
      },
      dispatchCommand,
      externalWatchController,
    })

    expect(dispatchCommand).toHaveBeenNthCalledWith(1, 'save.started', {
      jobId: 'save-job-1',
    })
    expect(dispatchCommand).toHaveBeenNthCalledWith(2, 'save.succeeded', expect.objectContaining({
      jobId: 'save-job-1',
      path: 'C:/docs/demo.md',
      content: '# demo',
      revision: 3,
      trigger: 'manual-save',
    }))
    expect(dispatchCommand.mock.calls.some(call => call[0] === 'save.failed')).toBe(false)
  })

  it('writeFile 已成功时，即使 recent.add 很慢，save.succeeded 也必须先回流，不能继续卡在 recent 副作用上', async () => {
    const { service, fsModule, recentStore } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({})
    const recentDeferred = createDeferred()
    const { externalWatchController } = createEffectHostControllers()

    fsModule.writeFile.mockResolvedValue(undefined)
    recentStore.add.mockReturnValue(recentDeferred.promise)

    const applyEffectPromise = service.applyEffect({
      effect: {
        type: 'execute-save',
        job: {
          jobId: 'save-job-pending-recent',
          path: 'C:/docs/demo.md',
          content: '# demo',
          revision: 6,
          trigger: 'manual-save',
        },
      },
      dispatchCommand,
      externalWatchController,
    })

    await vi.waitFor(() => {
      expect(dispatchCommand).toHaveBeenNthCalledWith(2, 'save.succeeded', expect.objectContaining({
        jobId: 'save-job-pending-recent',
        path: 'C:/docs/demo.md',
        revision: 6,
      }))
    })

    recentDeferred.resolve(undefined)
    await applyEffectPromise
    expect(dispatchCommand.mock.calls.some(call => call[0] === 'save.failed')).toBe(false)
  })

  it('close-window effect 必须通过 closeHostController.continueWindowClose 落地，不能继续消费旧宿主字段', async () => {
    const { service } = await createServiceContext()
    const { closeHostController } = createEffectHostControllers()

    await service.applyEffect({
      effect: {
        type: 'close-window',
      },
      closeHostController,
    })

    expect(closeHostController.continueWindowClose).toHaveBeenCalledTimes(1)
  })

  it('execute-save 内嵌 watcher 重绑失败时，必须回流 watch.rebind-failed，不能把已成功写盘升级成副作用异常', async () => {
    const { service, fsModule } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({})
    const { externalWatchController } = createEffectHostControllers({
      externalWatchController: {
        start: vi.fn().mockRejectedValue(new Error('watch bind failed')),
        getContext: vi.fn(() => ({
          bindingToken: 7,
          watchingPath: 'C:/docs/demo.md',
          shouldRebindAfterSave: true,
        })),
      },
    })

    fsModule.writeFile.mockResolvedValue(undefined)
    await expect(service.applyEffect({
      effect: {
        type: 'execute-save',
        job: {
          jobId: 'save-job-2',
          path: 'C:/docs/demo.md',
          content: '# demo',
          revision: 4,
          trigger: 'manual-save',
        },
      },
      dispatchCommand,
      externalWatchController,
    })).resolves.toBeNull()

    expect(dispatchCommand).toHaveBeenNthCalledWith(1, 'save.started', {
      jobId: 'save-job-2',
    })
    expect(dispatchCommand).toHaveBeenNthCalledWith(2, 'save.succeeded', expect.objectContaining({
      jobId: 'save-job-2',
      path: 'C:/docs/demo.md',
      revision: 4,
    }))
    expect(dispatchCommand).toHaveBeenCalledWith('watch.rebind-failed', {
      bindingToken: 7,
      watchingPath: 'C:/docs/demo.md',
      error: expect.objectContaining({
        name: 'Error',
        message: 'watch bind failed',
      }),
    })
    expect(dispatchCommand.mock.calls.some(call => call[0] === 'save.failed')).toBe(false)
  })

  it('execute-save 内嵌重绑成功时，也必须回流 watch.bound，避免会话残留假活跃 watcher 状态', async () => {
    const { service, fsModule } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({})
    const { externalWatchController } = createEffectHostControllers({
      externalWatchController: {
        start: vi.fn().mockResolvedValue({
          ok: true,
          watchingPath: 'C:/docs/demo.md',
          watchingDirectoryPath: 'C:/docs',
        }),
        getContext: vi.fn(() => ({
          bindingToken: 8,
          watchingPath: 'C:/docs/demo.md',
          shouldRebindAfterSave: true,
        })),
      },
    })

    fsModule.writeFile.mockResolvedValue(undefined)

    await service.applyEffect({
      effect: {
        type: 'execute-save',
        job: {
          jobId: 'save-job-3',
          path: 'C:/docs/demo.md',
          content: '# demo',
          revision: 5,
          trigger: 'manual-save',
        },
      },
      dispatchCommand,
      externalWatchController,
    })

    expect(dispatchCommand).toHaveBeenCalledWith('watch.bound', {
      bindingToken: 8,
      watchingPath: 'C:/docs/demo.md',
      watchingDirectoryPath: 'C:/docs',
    })
    expect(externalWatchController.markInternalSave).toHaveBeenCalledWith('# demo')
    expect(dispatchCommand.mock.calls.some(call => call[0] === 'watch.rebind-failed')).toBe(false)
  })

  it('notify-watch-warning 必须回流统一消息出口，而不是被 applyEffect 静默吞掉', async () => {
    const { service } = await createServiceContext()
    const { windowMessageController } = createEffectHostControllers()

    await service.applyEffect({
      effect: {
        type: 'notify-watch-warning',
        level: 'warning',
        reason: 'watch-error',
        error: {
          name: 'Error',
          message: 'watch crashed',
          code: 'EIO',
        },
      },
      windowMessageController,
    })

    expect(windowMessageController.publishWindowMessage).toHaveBeenCalledWith({
      type: 'warning',
      content: 'message.fileExternalChangeReadFailed',
    })
  })

  it('notify-external-change 在系统通知可用时，必须弹出系统通知而不是退回窗口消息', async () => {
    const { service, notificationApi, showMock } = await createServiceContext()
    const { windowMessageController } = createEffectHostControllers()
    const notificationInstance = {
      on: vi.fn(),
      show: vi.fn(),
    }

    notificationApi.isSupported.mockReturnValue(true)
    showMock.mockReturnValue(notificationInstance)

    await service.applyEffect({
      effect: {
        type: 'notify-external-change',
        mode: 'applied',
        documentPath: 'C:/docs/demo.md',
      },
      windowMessageController,
    })

    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '文件内容已更新 - demo.md',
      body: expect.stringContaining('检测到文件被外部修改，已自动应用最新内容。'),
    }))
    expect(notificationInstance.on).toHaveBeenCalledWith('click', expect.any(Function))
    expect(notificationInstance.show).toHaveBeenCalledTimes(1)
    expect(windowMessageController.publishWindowMessage).not.toHaveBeenCalled()
  })

  it('notify-external-change 在系统通知不可用时，必须退回统一窗口消息出口', async () => {
    const { service, notificationApi, showMock } = await createServiceContext()
    const { windowMessageController } = createEffectHostControllers()

    notificationApi.isSupported.mockReturnValue(false)

    await service.applyEffect({
      effect: {
        type: 'notify-external-change',
        mode: 'applied',
        documentPath: 'C:/docs/demo.md',
      },
      windowMessageController,
    })

    expect(showMock).not.toHaveBeenCalled()
    expect(windowMessageController.publishWindowMessage).toHaveBeenCalledWith({
      type: 'info',
      content: 'message.fileExternalChangeAutoApplied',
    })
  })

  it('notify-external-change(prompt) 在系统通知可用时，必须弹出“待处理”系统通知', async () => {
    const { service, notificationApi, showMock } = await createServiceContext()
    const { windowMessageController } = createEffectHostControllers()
    const notificationInstance = {
      on: vi.fn(),
      show: vi.fn(),
    }

    notificationApi.isSupported.mockReturnValue(true)
    showMock.mockReturnValue(notificationInstance)

    await service.applyEffect({
      effect: {
        type: 'notify-external-change',
        mode: 'prompt',
        documentPath: 'C:/docs/demo.md',
      },
      windowMessageController,
    })

    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '文件内容已更新 - demo.md',
      body: expect.stringContaining('检测到文件被外部修改，请返回编辑器查看并处理。'),
    }))
    expect(notificationInstance.show).toHaveBeenCalledTimes(1)
    expect(windowMessageController.publishWindowMessage).not.toHaveBeenCalled()
  })

  it('notify-external-change(prompt) 在系统通知不可用时，必须退回本地化提示文案', async () => {
    const { service, notificationApi, showMock } = await createServiceContext()
    const { windowMessageController } = createEffectHostControllers()

    notificationApi.isSupported.mockReturnValue(false)

    await service.applyEffect({
      effect: {
        type: 'notify-external-change',
        mode: 'prompt',
        documentPath: 'C:/docs/demo.md',
      },
      windowMessageController,
    })

    expect(showMock).not.toHaveBeenCalled()
    expect(windowMessageController.publishWindowMessage).toHaveBeenCalledWith({
      type: 'info',
      content: expect.stringContaining('检测到文件被外部修改，请返回编辑器查看并处理。'),
    })
  })

  it('notify-external-change(missing) 在系统通知可用时，必须弹出带文件路径的缺失通知', async () => {
    const { service, notificationApi, showMock } = await createServiceContext()
    const { windowMessageController } = createEffectHostControllers()
    const notificationInstance = {
      on: vi.fn(),
      show: vi.fn(),
    }

    notificationApi.isSupported.mockReturnValue(true)
    showMock.mockReturnValue(notificationInstance)

    await service.applyEffect({
      effect: {
        type: 'notify-external-change',
        mode: 'missing',
        documentPath: 'C:/docs/demo.md',
      },
      windowMessageController,
    })

    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '文件已被删除或移动 - demo.md',
      body: expect.stringContaining('路径：C:/docs/demo.md'),
    }))
    expect(notificationInstance.show).toHaveBeenCalledTimes(1)
    expect(windowMessageController.publishWindowMessage).not.toHaveBeenCalled()
  })

  it('notify-external-change(missing) 在系统通知不可用时，必须退回带文件路径的窗口消息', async () => {
    const { service, notificationApi, showMock } = await createServiceContext()
    const { windowMessageController } = createEffectHostControllers()

    notificationApi.isSupported.mockReturnValue(false)

    await service.applyEffect({
      effect: {
        type: 'notify-external-change',
        mode: 'missing',
        documentPath: 'C:/docs/demo.md',
      },
      windowMessageController,
    })

    expect(showMock).not.toHaveBeenCalled()
    expect(windowMessageController.publishWindowMessage).toHaveBeenCalledWith({
      type: 'info',
      content: expect.stringContaining('路径：C:/docs/demo.md'),
    })
  })

  it('rebind-watch 必须启动新的 watcher 绑定，并在成功后回流 watch.bound', async () => {
    const { service } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({ ok: true })
    const { externalWatchController } = createEffectHostControllers({
      externalWatchController: {
        start: vi.fn().mockResolvedValue({
          ok: true,
          watchingPath: 'C:/docs/demo.md',
          watchingDirectoryPath: 'C:/docs',
        }),
      },
    })

    await service.applyEffect({
      effect: {
        type: 'rebind-watch',
        bindingToken: 2,
        watchingPath: 'C:/docs/demo.md',
      },
      dispatchCommand,
      externalWatchController,
    })

    expect(externalWatchController.start).toHaveBeenCalledWith({
      bindingToken: 2,
      watchingPath: 'C:/docs/demo.md',
    })
    expect(dispatchCommand).toHaveBeenCalledWith('watch.bound', {
      bindingToken: 2,
      watchingPath: 'C:/docs/demo.md',
      watchingDirectoryPath: 'C:/docs',
    })
    expect(dispatchCommand.mock.calls.filter(call => call[0] === 'watch.bound')).toHaveLength(1)
    expect(dispatchCommand.mock.calls.some(call => call[0] === 'watch.rebind-failed')).toBe(false)
  })

  it('rebind-watch 如果重新绑定失败，必须回流 watch.rebind-failed', async () => {
    const { service } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({ ok: true })
    const { externalWatchController } = createEffectHostControllers({
      externalWatchController: {
        start: vi.fn().mockRejectedValue(new Error('watch crashed')),
      },
    })

    await service.applyEffect({
      effect: {
        type: 'rebind-watch',
        bindingToken: 3,
        watchingPath: 'C:/docs/demo.md',
      },
      dispatchCommand,
      externalWatchController,
    })

    expect(dispatchCommand).toHaveBeenCalledWith('watch.rebind-failed', {
      bindingToken: 3,
      watchingPath: 'C:/docs/demo.md',
      error: expect.objectContaining({
        name: 'Error',
        message: 'watch crashed',
      }),
    })
    expect(dispatchCommand.mock.calls.filter(call => call[0] === 'watch.rebind-failed')).toHaveLength(1)
    expect(dispatchCommand.mock.calls.some(call => call[0] === 'watch.bound')).toBe(false)
  })

  it('rebind-watch 在 startExternalWatch 显式返回 ok=false 时，也必须回流 watch.rebind-failed', async () => {
    const { service } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({ ok: true })
    const { externalWatchController } = createEffectHostControllers({
      externalWatchController: {
        start: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error('watch path missing'),
        }),
      },
    })

    await service.applyEffect({
      effect: {
        type: 'rebind-watch',
        bindingToken: 4,
        watchingPath: 'C:/docs/demo.md',
      },
      dispatchCommand,
      externalWatchController,
    })

    expect(dispatchCommand).toHaveBeenCalledWith('watch.rebind-failed', {
      bindingToken: 4,
      watchingPath: 'C:/docs/demo.md',
      error: expect.objectContaining({
        name: 'Error',
        message: 'watch path missing',
      }),
    })
    expect(dispatchCommand.mock.calls.filter(call => call[0] === 'watch.rebind-failed')).toHaveLength(1)
    expect(dispatchCommand.mock.calls.some(call => call[0] === 'watch.bound')).toBe(false)
  })
})
