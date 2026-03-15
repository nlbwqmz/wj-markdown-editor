import { describe, expect, it, vi } from 'vitest'

async function createServiceContext() {
  const dialogApi = {
    showOpenDialogSync: vi.fn(),
  }
  const fsModule = {
    pathExists: vi.fn(),
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
  })

  return {
    service,
    dialogApi,
    fsModule,
    recentStore,
    resourceUtil,
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
      reason: 'recent-missing',
      path: 'C:/docs/missing.md',
    })
    expect(openDocumentWindow).not.toHaveBeenCalled()
    expect(activateRecentMissingSession).not.toHaveBeenCalled()
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
      shouldRebindExternalWatchAfterSave: () => false,
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

  it('notify-watch-warning 必须回流统一消息出口，而不是被 applyEffect 静默吞掉', async () => {
    const { service } = await createServiceContext()
    const showWindowMessage = vi.fn()

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
      showWindowMessage,
    })

    expect(showWindowMessage).toHaveBeenCalledWith({
      type: 'warning',
      content: 'message.fileExternalChangeReadFailed',
    })
  })

  it('rebind-watch 必须启动新的 watcher 绑定，并在成功后回流 watch.bound', async () => {
    const { service } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({ ok: true })
    const startExternalWatch = vi.fn().mockResolvedValue({
      ok: true,
      watchingPath: 'C:/docs/demo.md',
      watchingDirectoryPath: 'C:/docs',
    })

    await service.applyEffect({
      effect: {
        type: 'rebind-watch',
        bindingToken: 2,
        watchingPath: 'C:/docs/demo.md',
      },
      dispatchCommand,
      startExternalWatch,
    })

    expect(startExternalWatch).toHaveBeenCalledWith({
      bindingToken: 2,
      watchingPath: 'C:/docs/demo.md',
    })
    expect(dispatchCommand).toHaveBeenCalledWith('watch.bound', {
      bindingToken: 2,
      watchingPath: 'C:/docs/demo.md',
      watchingDirectoryPath: 'C:/docs',
    })
    expect(dispatchCommand.mock.calls.some(call => call[0] === 'watch.rebind-failed')).toBe(false)
  })

  it('rebind-watch 如果重新绑定失败，必须回流 watch.rebind-failed', async () => {
    const { service } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({ ok: true })
    const startExternalWatch = vi.fn().mockRejectedValue(new Error('watch crashed'))

    await service.applyEffect({
      effect: {
        type: 'rebind-watch',
        bindingToken: 3,
        watchingPath: 'C:/docs/demo.md',
      },
      dispatchCommand,
      startExternalWatch,
    })

    expect(dispatchCommand).toHaveBeenCalledWith('watch.rebind-failed', {
      bindingToken: 3,
      watchingPath: 'C:/docs/demo.md',
      error: expect.objectContaining({
        name: 'Error',
        message: 'watch crashed',
      }),
    })
    expect(dispatchCommand.mock.calls.some(call => call[0] === 'watch.bound')).toBe(false)
  })

  it('rebind-watch 在 startExternalWatch 显式返回 ok=false 时，也必须回流 watch.rebind-failed', async () => {
    const { service } = await createServiceContext()
    const dispatchCommand = vi.fn().mockResolvedValue({ ok: true })
    const startExternalWatch = vi.fn().mockResolvedValue({
      ok: false,
      error: new Error('watch path missing'),
    })

    await service.applyEffect({
      effect: {
        type: 'rebind-watch',
        bindingToken: 4,
        watchingPath: 'C:/docs/demo.md',
      },
      dispatchCommand,
      startExternalWatch,
    })

    expect(dispatchCommand).toHaveBeenCalledWith('watch.rebind-failed', {
      bindingToken: 4,
      watchingPath: 'C:/docs/demo.md',
      error: expect.objectContaining({
        name: 'Error',
        message: 'watch path missing',
      }),
    })
    expect(dispatchCommand.mock.calls.some(call => call[0] === 'watch.bound')).toBe(false)
  })
})
