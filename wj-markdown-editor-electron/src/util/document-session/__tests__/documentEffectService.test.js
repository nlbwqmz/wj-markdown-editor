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
    readFile: vi.fn(),
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
  it('document.request-open-dialog 选中文件时，必须直接返回 selected 结构，不能再回流旧命令', async () => {
    const { service, dialogApi } = await createServiceContext()

    dialogApi.showOpenDialogSync.mockReturnValue(['C:/docs/demo.md'])

    const result = await service.executeCommand({
      command: 'document.request-open-dialog',
    })

    expect(result).toEqual({
      ok: true,
      reason: 'selected',
      path: 'C:/docs/demo.md',
    })
  })

  it('document.request-open-dialog 取消时，必须直接返回 cancelled 结构，不能再回流旧命令', async () => {
    const { service, dialogApi } = await createServiceContext()

    dialogApi.showOpenDialogSync.mockReturnValue(undefined)

    const result = await service.executeCommand({
      command: 'document.request-open-dialog',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'cancelled',
      path: null,
    })
  })

  it('document.request-open-dialog 打开系统对话框失败时，必须返回 dialog-open-failed 结构', async () => {
    const { service, dialogApi } = await createServiceContext()

    dialogApi.showOpenDialogSync.mockImplementation(() => {
      throw new Error('dialog crashed')
    })

    const result = await service.executeCommand({
      command: 'document.request-open-dialog',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'dialog-open-failed',
      path: null,
    })
  })

  it('document.request-open-dialog 的过滤器必须同时放行 .md 与 .markdown', async () => {
    const { service, dialogApi } = await createServiceContext()

    dialogApi.showOpenDialogSync.mockReturnValue(undefined)

    await service.executeCommand({
      command: 'document.request-open-dialog',
    })

    expect(dialogApi.showOpenDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      filters: [
        { name: 'markdown file', extensions: ['md', 'markdown'] },
      ],
    }))
  })

  it('document.resolve-open-target 命中存在但非 .md 的路径时，必须拦截并返回 invalid-extension', async () => {
    const { service, fsModule } = await createServiceContext()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# plain')

    const result = await service.executeCommand({
      command: 'document.resolve-open-target',
      payload: {
        path: 'C:/docs/plain.txt',
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-invalid-extension',
      path: 'C:/docs/plain.txt',
    })
  })

  it('document.resolve-open-target 命中 .markdown 路径时，必须返回 needs-open-mode-choice', async () => {
    const { service, fsModule } = await createServiceContext()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# markdown')

    const result = await service.executeCommand({
      command: 'document.resolve-open-target',
      payload: {
        path: 'C:/docs/demo.markdown',
      },
    })

    expect(result).toEqual({
      ok: true,
      decision: 'needs-open-mode-choice',
      path: 'C:/docs/demo.markdown',
    })
  })

  it('document.resolve-open-target 命中当前已打开文档时，必须返回 noop-current-file', async () => {
    const { service, fsModule } = await createServiceContext()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# current')

    const result = await service.executeCommand({
      command: 'document.resolve-open-target',
      payload: {
        path: 'C:/docs/current.md',
      },
      getSessionSnapshot: () => ({
        isRecentMissing: false,
        resourceContext: {
          documentPath: 'C:/docs/current.md',
        },
      }),
    })

    expect(result).toEqual({
      ok: true,
      decision: 'noop-current-file',
      path: 'C:/docs/current.md',
    })
  })

  it('document.resolve-open-target 在当前会话是 recent-missing 且路径文本相同时，也不能返回 noop-current-file', async () => {
    const { service, fsModule } = await createServiceContext()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# restored')

    const result = await service.executeCommand({
      command: 'document.resolve-open-target',
      payload: {
        path: 'C:/docs/missing.md',
        entrySource: 'recent',
      },
      getSessionSnapshot: () => ({
        isRecentMissing: true,
        recentMissingPath: 'C:/docs/missing.md',
        resourceContext: {
          documentPath: null,
        },
      }),
    })

    expect(result).toEqual({
      ok: true,
      decision: 'needs-open-mode-choice',
      path: 'C:/docs/missing.md',
    })
  })

  it('document.resolve-open-target 命中其他窗口已打开目标时，必须返回 focused-existing-window', async () => {
    const { service, fsModule } = await createServiceContext()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# opened elsewhere')

    const result = await service.executeCommand({
      command: 'document.resolve-open-target',
      payload: {
        path: 'C:/docs/other.md',
      },
      getExistingWindowIdByPath: vi.fn(() => 'window-2'),
    })

    expect(result).toEqual({
      ok: true,
      decision: 'focused-existing-window',
      path: 'C:/docs/other.md',
      windowId: 'window-2',
    })
  })

  it('document.resolve-open-target 对 recent 入口命中缺失文件时，必须返回 recent-missing', async () => {
    const { service, fsModule } = await createServiceContext()

    fsModule.pathExists.mockResolvedValue(false)

    const result = await service.executeCommand({
      command: 'document.resolve-open-target',
      payload: {
        path: 'C:/docs/missing.md',
        entrySource: 'recent',
        trigger: 'user',
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'recent-missing',
      path: 'C:/docs/missing.md',
    })
  })

  it('document.resolve-open-target 预读目标失败时，必须返回 open-target-read-failed', async () => {
    const { service, fsModule } = await createServiceContext()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockRejectedValue(new Error('EACCES'))

    const result = await service.executeCommand({
      command: 'document.resolve-open-target',
      payload: {
        path: 'C:/docs/locked.md',
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-target-read-failed',
      path: 'C:/docs/locked.md',
    })
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
    fsModule.readFile.mockResolvedValue('# demo')

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

  it('document.prepare-open-path-in-current-window 在当前文档 dirty 时，必须返回 needs-save-choice', async () => {
    const { service, fsModule } = await createServiceContext()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# next')

    const result = await service.executeCommand({
      command: 'document.prepare-open-path-in-current-window',
      payload: {
        path: 'C:/docs/next.md',
        sourceSessionId: 'session-current',
        sourceRevision: 7,
      },
      getSessionSnapshot: () => ({
        sessionId: 'session-current',
        revision: 7,
        dirty: true,
        isRecentMissing: false,
        resourceContext: {
          documentPath: 'C:/docs/current.md',
        },
      }),
    })

    expect(result).toEqual({
      ok: true,
      decision: 'needs-save-choice',
      path: 'C:/docs/next.md',
      sourceSessionId: 'session-current',
      sourceRevision: 7,
    })
  })

  it('document.prepare-open-path-in-current-window 在当前文档 clean 时，必须返回 ready-to-switch', async () => {
    const { service, fsModule } = await createServiceContext()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# next')

    const result = await service.executeCommand({
      command: 'document.prepare-open-path-in-current-window',
      payload: {
        path: 'C:/docs/next.md',
        sourceSessionId: 'session-current',
        sourceRevision: 7,
      },
      getSessionSnapshot: () => ({
        sessionId: 'session-current',
        revision: 7,
        dirty: false,
        isRecentMissing: false,
        resourceContext: {
          documentPath: 'C:/docs/current.md',
        },
      }),
    })

    expect(result).toEqual({
      ok: true,
      decision: 'ready-to-switch',
      path: 'C:/docs/next.md',
      sourceSessionId: 'session-current',
      sourceRevision: 7,
    })
  })

  it('document.prepare-open-path-in-current-window 命中其他窗口已打开目标时，必须在 save-choice 前返回 focused-existing-window', async () => {
    const { service, fsModule } = await createServiceContext()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# other')

    const result = await service.executeCommand({
      command: 'document.prepare-open-path-in-current-window',
      payload: {
        path: 'C:/docs/other.md',
        sourceSessionId: 'session-current',
        sourceRevision: 7,
      },
      getSessionSnapshot: () => ({
        sessionId: 'session-current',
        revision: 7,
        dirty: true,
        isRecentMissing: false,
        resourceContext: {
          documentPath: 'C:/docs/current.md',
        },
      }),
      getExistingWindowIdByPath: vi.fn(() => 'window-2'),
    })

    expect(result).toEqual({
      ok: true,
      decision: 'focused-existing-window',
      path: 'C:/docs/other.md',
      sourceSessionId: 'session-current',
      sourceRevision: 7,
      windowId: 'window-2',
    })
  })

  it.each([
    [
      'document.open-path',
      {
        command: 'document.open-path',
        payload: {
          path: 'C:/docs/other.md',
          trigger: 'user',
        },
      },
      {
        ok: true,
        decision: 'focused-existing-window',
        path: 'C:/docs/other.md',
        windowId: 'window-2',
      },
    ],
    [
      'document.open-recent',
      {
        command: 'document.open-recent',
        payload: {
          path: 'C:/docs/other.md',
          trigger: 'user',
        },
      },
      {
        ok: true,
        decision: 'focused-existing-window',
        path: 'C:/docs/other.md',
        windowId: 'window-2',
      },
    ],
    [
      'document.prepare-open-path-in-current-window',
      {
        command: 'document.prepare-open-path-in-current-window',
        payload: {
          path: 'C:/docs/other.md',
          sourceSessionId: 'session-current',
          sourceRevision: 7,
        },
        getSessionSnapshot: () => ({
          sessionId: 'session-current',
          revision: 7,
          dirty: true,
          isRecentMissing: false,
          resourceContext: {
            documentPath: 'C:/docs/current.md',
          },
        }),
      },
      {
        ok: true,
        decision: 'focused-existing-window',
        path: 'C:/docs/other.md',
        sourceSessionId: 'session-current',
        sourceRevision: 7,
        windowId: 'window-2',
      },
    ],
  ])('%s 命中其他窗口已打开目标时，必须通过统一副作用同时聚焦并刷新 recent 顺序', async (_title, commandInput, expectedResult) => {
    const { service, fsModule, recentStore } = await createServiceContext()
    const focusWindowById = vi.fn(() => true)
    const openDocumentWindow = vi.fn()
    const prepareOpenPathInCurrentWindow = vi.fn()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# other')

    const result = await service.executeCommand({
      ...commandInput,
      getExistingWindowIdByPath: vi.fn(() => 'window-2'),
      focusWindowById,
      openDocumentWindow,
      prepareOpenPathInCurrentWindow,
    })

    expect(result).toEqual(expectedResult)
    expect(focusWindowById).toHaveBeenCalledWith('window-2')
    expect(recentStore.add).toHaveBeenCalledWith('C:/docs/other.md')
    expect(openDocumentWindow).not.toHaveBeenCalled()
    expect(prepareOpenPathInCurrentWindow).not.toHaveBeenCalled()
  })

  it.each([
    [
      '缺失路径',
      {
        path: 'C:/docs/missing.md',
        sourceSessionId: 'session-current',
        sourceRevision: 7,
      },
      async (fsModule) => {
        fsModule.pathExists.mockResolvedValue(false)
      },
      {
        ok: false,
        reason: 'open-target-missing',
        path: 'C:/docs/missing.md',
      },
    ],
    [
      '非 Markdown 扩展',
      {
        path: 'C:/docs/plain.txt',
        sourceSessionId: 'session-current',
        sourceRevision: 7,
      },
      async (fsModule) => {
        fsModule.pathExists.mockResolvedValue(true)
        fsModule.stat.mockResolvedValue({
          isFile: () => true,
        })
        fsModule.readFile.mockResolvedValue('# plain')
      },
      {
        ok: false,
        reason: 'open-target-invalid-extension',
        path: 'C:/docs/plain.txt',
      },
    ],
    [
      '目录型 Markdown 目标',
      {
        path: 'C:/docs/folder.md',
        sourceSessionId: 'session-current',
        sourceRevision: 7,
      },
      async (fsModule) => {
        fsModule.pathExists.mockResolvedValue(true)
        fsModule.stat.mockResolvedValue({
          isFile: () => false,
        })
      },
      {
        ok: false,
        reason: 'open-target-not-file',
        path: 'C:/docs/folder.md',
      },
    ],
  ])('document.prepare-open-path-in-current-window 命中%s时，必须保留阶段一失败结果', async (_title, payload, prepareFs, expectedResult) => {
    const { service, fsModule } = await createServiceContext()
    await prepareFs(fsModule)

    const result = await service.executeCommand({
      command: 'document.prepare-open-path-in-current-window',
      payload,
    })

    expect(result).toEqual(expectedResult)
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

  it('document.open-recent 命中存在但非 .md 的路径时，user/startup 两条入口都必须统一拦截', async () => {
    const { service, fsModule } = await createServiceContext()
    const openDocumentWindow = vi.fn()

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# plain')

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
      command: 'document.resolve-open-target',
      payload: {
        path: 'C:/docs/folder.md',
      },
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

  it('document.open-path-in-current-window 必须把 switchPolicy 和 expected session 信息原样交给 execute 阶段', async () => {
    const { service, fsModule } = await createServiceContext()
    const openDocumentInCurrentWindow = vi.fn().mockResolvedValue({
      ok: true,
      reason: 'opened',
      path: 'C:/docs/next.md',
    })

    fsModule.pathExists.mockResolvedValue(true)
    fsModule.stat.mockResolvedValue({
      isFile: () => true,
    })
    fsModule.readFile.mockResolvedValue('# next')

    const result = await service.executeCommand({
      command: 'document.open-path-in-current-window',
      payload: {
        path: 'C:/docs/next.md',
        entrySource: 'file-manager',
        trigger: 'user',
        switchPolicy: 'discard-switch',
        expectedSessionId: 'session-current',
        expectedRevision: 7,
      },
      openDocumentInCurrentWindow,
    })

    expect(openDocumentInCurrentWindow).toHaveBeenCalledWith('C:/docs/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
      switchPolicy: 'discard-switch',
      expectedSessionId: 'session-current',
      expectedRevision: 7,
    })
    expect(result).toEqual({
      ok: true,
      reason: 'opened',
      path: 'C:/docs/next.md',
    })
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
