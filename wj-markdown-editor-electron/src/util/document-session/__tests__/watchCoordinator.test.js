import { describe, expect, it } from 'vitest'
import { createBoundFileSession } from '../documentSessionFactory.js'
import { createWatchCoordinator } from '../watchCoordinator.js'

function createSession() {
  const session = createBoundFileSession({
    sessionId: 'watch-session',
    path: 'C:/docs/demo.md',
    content: '# 原始磁盘内容',
    stat: {
      mtimeMs: 1700000003000,
    },
    now: 1700000003000,
  })

  session.watchRuntime.bindingToken = 1
  session.watchRuntime.status = 'active'
  session.watchRuntime.watchingPath = 'C:/docs/demo.md'
  session.watchRuntime.watchingDirectoryPath = 'C:/docs'
  return session
}

function dispatchWatchCommand(coordinator, session, command, payload, options = {}) {
  return coordinator.dispatch(session, {
    command,
    payload,
    externalChangeStrategy: options.externalChangeStrategy || 'prompt',
  })
}

describe('watchCoordinator', () => {
  it('watch.bound 只有 bindingToken 仍等于当前 token 时才允许落为 active', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003001,
    })
    const session = createSession()

    // 先把会话推进到“正在重绑但尚未成功”的状态，
    // 然后验证旧 token 的 bound 结果不会覆盖当前真正还在等待的重绑尝试。
    session.watchRuntime.bindingToken = 3
    session.watchRuntime.status = 'rebinding'
    session.watchRuntime.watchingDirectoryPath = null

    const staleBound = dispatchWatchCommand(coordinator, session, 'watch.bound', {
      bindingToken: 2,
      watchingPath: 'C:/docs/stale.md',
      watchingDirectoryPath: 'C:/docs',
    })

    expect(staleBound.effects).toEqual([])
    expect(staleBound.session.watchRuntime.status).toBe('rebinding')
    expect(staleBound.session.watchRuntime.watchingPath).toBe('C:/docs/demo.md')
    expect(staleBound.session.watchRuntime.watchingDirectoryPath).toBeNull()

    const currentBound = dispatchWatchCommand(coordinator, session, 'watch.bound', {
      bindingToken: 3,
      watchingPath: 'C:/docs/demo.md',
      watchingDirectoryPath: 'C:/docs',
    })

    expect(currentBound.effects).toEqual([])
    expect(currentBound.session.watchRuntime.status).toBe('active')
    expect(currentBound.session.watchRuntime.watchingPath).toBe('C:/docs/demo.md')
    expect(currentBound.session.watchRuntime.watchingDirectoryPath).toBe('C:/docs')
  })

  it('watch.unbound 只有 current token 才允许回落 idle，缺 token 和 stale token 都必须丢弃', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003001,
    })
    const session = createSession()
    session.watchRuntime.bindingToken = 4
    session.watchRuntime.status = 'active'
    session.watchRuntime.watchingDirectoryPath = 'C:/docs'

    // 无 token 的 unbound 没法证明它属于当前 watcher 生命周期，
    // 如果允许它直接落地，就会把仍然活着的 watcher 错误打回 idle。
    const tokenlessUnbound = dispatchWatchCommand(coordinator, session, 'watch.unbound')
    expect(tokenlessUnbound.effects).toEqual([])
    expect(tokenlessUnbound.session.watchRuntime.status).toBe('active')
    expect(tokenlessUnbound.session.watchRuntime.watchingDirectoryPath).toBe('C:/docs')

    // 旧 token 的解绑结果也必须丢弃，避免旧 watcher 的尾事件污染当前状态机。
    const staleUnbound = dispatchWatchCommand(coordinator, session, 'watch.unbound', {
      bindingToken: 3,
    })
    expect(staleUnbound.effects).toEqual([])
    expect(staleUnbound.session.watchRuntime.status).toBe('active')
    expect(staleUnbound.session.watchRuntime.watchingDirectoryPath).toBe('C:/docs')

    // 只有 current token 的解绑事件，才能把当前 watcher 明确收敛到 idle。
    const currentUnbound = dispatchWatchCommand(coordinator, session, 'watch.unbound', {
      bindingToken: 4,
    })
    expect(currentUnbound.effects).toEqual([])
    expect(currentUnbound.session.watchRuntime.status).toBe('idle')
    expect(currentUnbound.session.watchRuntime.watchingDirectoryPath).toBeNull()
  })

  it('旧 token 的 watch.file-changed / watch.file-missing / watch.file-restored / watch.error 必须全部丢弃', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003002,
    })
    const session = createSession()
    session.editorSnapshot.content = '# 当前本地编辑'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000003002
    session.watchRuntime.eventFloorObservedAt = 1700000002990

    const staleEventList = [
      {
        command: 'watch.file-changed',
        payload: {
          bindingToken: 0,
          observedAt: 1700000003003,
          diskContent: '# 旧路径迟到内容',
          diskStat: {
            mtimeMs: 1700000003003,
          },
        },
      },
      {
        command: 'watch.file-missing',
        payload: {
          bindingToken: 0,
          observedAt: 1700000003004,
          error: {
            name: 'Error',
            message: 'ENOENT',
            code: 'ENOENT',
          },
        },
      },
      {
        command: 'watch.file-restored',
        payload: {
          bindingToken: 0,
          observedAt: 1700000003005,
          diskContent: '# 恢复后的迟到内容',
          diskStat: {
            mtimeMs: 1700000003005,
          },
        },
      },
      {
        command: 'watch.error',
        payload: {
          bindingToken: 0,
          watchingPath: 'C:/docs/stale.md',
          error: {
            name: 'Error',
            message: 'watch stale error',
            code: 'EUNKNOWN',
          },
        },
      },
    ]

    for (const staleEvent of staleEventList) {
      const result = dispatchWatchCommand(
        coordinator,
        session,
        staleEvent.command,
        staleEvent.payload,
      )

      expect(result.effects).toEqual([])
      expect(result.session.documentSource.path).toBe('C:/docs/demo.md')
      expect(result.session.documentSource.exists).toBe(true)
      expect(result.session.editorSnapshot.content).toBe('# 当前本地编辑')
      expect(result.session.diskSnapshot.content).toBe('# 原始磁盘内容')
      expect(result.session.watchRuntime.bindingToken).toBe(1)
      expect(result.session.watchRuntime.status).toBe('active')
      expect(result.session.externalRuntime.pendingExternalChange).toBeNull()
    }
  })

  it('同 token 下 observedAt 小于等于 eventFloorObservedAt 的迟到事件必须被丢弃', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003003,
    })
    const session = createSession()
    session.watchRuntime.eventFloorObservedAt = 1700000003010
    session.editorSnapshot.content = '# 本地内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000003003

    const lateChanged = dispatchWatchCommand(coordinator, session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003010,
      diskContent: '# 迟到变化',
      diskStat: {
        mtimeMs: 1700000003010,
      },
    })

    expect(lateChanged.effects).toEqual([])
    expect(lateChanged.session.diskSnapshot.content).toBe('# 原始磁盘内容')
    expect(lateChanged.session.editorSnapshot.content).toBe('# 本地内容')
    expect(lateChanged.session.watchRuntime.eventFloorObservedAt).toBe(1700000003010)

    const lateMissing = dispatchWatchCommand(coordinator, session, 'watch.file-missing', {
      bindingToken: 1,
      observedAt: 1700000003009,
      error: {
        name: 'Error',
        message: 'ENOENT',
        code: 'ENOENT',
      },
    })

    expect(lateMissing.effects).toEqual([])
    expect(lateMissing.session.documentSource.exists).toBe(true)
    expect(lateMissing.session.diskSnapshot.exists).toBe(true)
    expect(lateMissing.session.watchRuntime.eventFloorObservedAt).toBe(1700000003010)
  })

  it('watch.file-missing 会把磁盘基线重置为空，但不能清空当前 editorSnapshot.content', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003004,
    })
    const session = createSession()

    // 这里先制造一个待处理的外部版本，
    // 后续缺失事件必须把它清掉并收敛为 missing，而不是继续保留旧弹窗。
    dispatchWatchCommand(coordinator, session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003005,
      diskContent: '# 外部新内容',
      diskStat: {
        mtimeMs: 1700000003005,
      },
    })
    session.editorSnapshot.content = '# 用户继续编辑的本地内容'
    session.editorSnapshot.revision = 2
    session.editorSnapshot.updatedAt = 1700000003006

    const missing = dispatchWatchCommand(coordinator, session, 'watch.file-missing', {
      bindingToken: 1,
      observedAt: 1700000003007,
      error: {
        name: 'Error',
        message: 'ENOENT',
        code: 'ENOENT',
      },
    })

    expect(missing.effects).toEqual([])
    expect(missing.session.documentSource.exists).toBe(false)
    expect(missing.session.documentSource.lastKnownStat).toBeNull()
    expect(missing.session.editorSnapshot.content).toBe('# 用户继续编辑的本地内容')
    expect(missing.session.diskSnapshot.content).toBe('')
    expect(missing.session.diskSnapshot.exists).toBe(false)
    expect(missing.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(missing.session.externalRuntime.resolutionState).toBe('missing')
    expect(missing.session.externalRuntime.lastResolutionResult).toBe('missing')
    expect(missing.session.watchRuntime.fileExists).toBe(false)
    expect(missing.session.watchRuntime.eventFloorObservedAt).toBe(1700000003007)
  })

  it('watch.file-restored 进入 restored 后，不能在 prepareSession 里直接回落；必须等首次有效读盘再收敛为 noop', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003008,
    })
    const session = createSession()

    dispatchWatchCommand(coordinator, session, 'watch.file-missing', {
      bindingToken: 1,
      observedAt: 1700000003008,
      error: {
        name: 'Error',
        message: 'ENOENT',
        code: 'ENOENT',
      },
    })

    const restored = dispatchWatchCommand(coordinator, session, 'watch.file-restored', {
      bindingToken: 1,
      observedAt: 1700000003009,
    })

    expect(restored.effects).toEqual([])
    expect(restored.session.documentSource.exists).toBe(true)
    expect(restored.session.diskSnapshot.content).toBe('')
    expect(restored.session.diskSnapshot.exists).toBe(false)
    expect(restored.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(restored.session.externalRuntime.resolutionState).toBe('restored')
    expect(restored.session.watchRuntime.fileExists).toBe(true)
    expect(restored.session.watchRuntime.eventFloorObservedAt).toBe(1700000003009)

    coordinator.prepareSession(restored.session)

    expect(restored.session.externalRuntime.resolutionState).toBe('restored')
    expect(restored.session.externalRuntime.lastResolutionResult).toBe('missing')

    restored.session.editorSnapshot.content = '# 恢复后的磁盘内容'
    restored.session.editorSnapshot.revision += 1
    restored.session.editorSnapshot.updatedAt = 1700000003010

    const firstChangedAfterRestored = dispatchWatchCommand(coordinator, restored.session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003011,
      diskContent: '# 恢复后的磁盘内容',
      diskStat: {
        mtimeMs: 1700000003011,
      },
    })

    expect(firstChangedAfterRestored.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(firstChangedAfterRestored.session.externalRuntime.resolutionState).toBe('resolved')
    expect(firstChangedAfterRestored.session.externalRuntime.lastResolutionResult).toBe('noop')
    expect(firstChangedAfterRestored.session.externalRuntime.lastHandledVersionHash)
      .toBe(firstChangedAfterRestored.session.diskSnapshot.versionHash)
  })

  it('watch.file-restored 自带 diskContent 时，必须立刻恢复磁盘基线，避免恢复后的 change 被去重吞掉后仍停在 missing', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003011,
    })
    const session = createSession()
    session.editorSnapshot.content = '# 恢复后的磁盘内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000003011

    dispatchWatchCommand(coordinator, session, 'watch.file-missing', {
      bindingToken: 1,
      observedAt: 1700000003012,
      error: {
        name: 'Error',
        message: 'ENOENT',
        code: 'ENOENT',
      },
    })

    const restored = dispatchWatchCommand(coordinator, session, 'watch.file-restored', {
      bindingToken: 1,
      observedAt: 1700000003013,
      diskContent: '# 恢复后的磁盘内容',
      diskStat: {
        mtimeMs: 1700000003013,
      },
    })

    expect(restored.effects).toEqual([])
    expect(restored.session.documentSource.exists).toBe(true)
    expect(restored.session.diskSnapshot.content).toBe('# 恢复后的磁盘内容')
    expect(restored.session.diskSnapshot.exists).toBe(true)
    expect(restored.session.diskSnapshot.observedAt).toBe(1700000003013)
    expect(restored.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(restored.session.externalRuntime.lastKnownDiskVersionHash)
      .toBe(restored.session.diskSnapshot.versionHash)
    expect(restored.session.watchRuntime.fileExists).toBe(true)
    expect(restored.session.watchRuntime.eventFloorObservedAt).toBe(1700000003013)
  })

  it('watch.file-restored 后的首次有效读盘若仍有差异，必须进入新的 pending-user，而不是直接回落为 idle', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003012,
    })
    const session = createSession()
    session.editorSnapshot.content = '# 本地继续编辑内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000003012

    dispatchWatchCommand(coordinator, session, 'watch.file-missing', {
      bindingToken: 1,
      observedAt: 1700000003013,
      error: {
        name: 'Error',
        message: 'ENOENT',
        code: 'ENOENT',
      },
    })

    const restored = dispatchWatchCommand(coordinator, session, 'watch.file-restored', {
      bindingToken: 1,
      observedAt: 1700000003014,
    })

    coordinator.prepareSession(restored.session)
    expect(restored.session.externalRuntime.resolutionState).toBe('restored')

    const firstChangedAfterRestored = dispatchWatchCommand(coordinator, restored.session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003015,
      diskContent: '# 恢复后的外部内容',
      diskStat: {
        mtimeMs: 1700000003015,
      },
    })

    expect(firstChangedAfterRestored.session.externalRuntime.resolutionState).toBe('pending-user')
    expect(firstChangedAfterRestored.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 1,
      diskContent: '# 恢复后的外部内容',
      detectedAt: 1700000003015,
      watchBindingToken: 1,
    })
  })

  it('真实外部差异在 prompt 模式下会保留 pending，继续编辑时也不能被清掉', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003010,
    })
    const session = createSession()

    const changed = dispatchWatchCommand(coordinator, session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003011,
      diskContent: '# 外部版本 1',
      diskStat: {
        mtimeMs: 1700000003011,
      },
    })

    expect(changed.session.externalRuntime.resolutionState).toBe('pending-user')
    expect(changed.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 1,
      diskContent: '# 外部版本 1',
      watchBindingToken: 1,
      detectedAt: 1700000003011,
    })

    changed.session.editorSnapshot.content = '# 用户在弹窗期间继续编辑'
    changed.session.editorSnapshot.revision = 1
    changed.session.editorSnapshot.updatedAt = 1700000003012

    expect(changed.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 1,
      diskContent: '# 外部版本 1',
      watchBindingToken: 1,
    })
    expect(changed.session.externalRuntime.resolutionState).toBe('pending-user')
  })

  it('真实外部差异在 apply 模式下必须自动应用，不创建 pendingExternalChange', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003013,
    })
    const session = createSession()
    session.editorSnapshot.content = '# 本地未保存内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000003013

    const autoApplied = dispatchWatchCommand(
      coordinator,
      session,
      'watch.file-changed',
      {
        bindingToken: 1,
        observedAt: 1700000003014,
        diskContent: '# 磁盘最新内容',
        diskStat: {
          mtimeMs: 1700000003014,
        },
      },
      {
        externalChangeStrategy: 'apply',
      },
    )

    expect(autoApplied.effects).toEqual([])
    expect(autoApplied.session.editorSnapshot.content).toBe('# 磁盘最新内容')
    expect(autoApplied.session.editorSnapshot.revision).toBe(2)
    expect(autoApplied.session.diskSnapshot.content).toBe('# 磁盘最新内容')
    expect(autoApplied.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(autoApplied.session.externalRuntime.resolutionState).toBe('resolved')
    expect(autoApplied.session.externalRuntime.lastResolutionResult).toBe('applied')
    expect(autoApplied.session.externalRuntime.lastHandledVersionHash)
      .toBe(autoApplied.session.diskSnapshot.versionHash)
  })

  it('document.external.apply / ignore / noop 必须正确更新审计字段并做同版本去重', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003015,
    })
    const session = createSession()
    session.editorSnapshot.content = '# 本地编辑内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000003015

    const promptChanged = dispatchWatchCommand(coordinator, session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003016,
      diskContent: '# 外部版本 1',
      diskStat: {
        mtimeMs: 1700000003016,
      },
    })

    const ignored = dispatchWatchCommand(coordinator, promptChanged.session, 'document.external.ignore')

    expect(ignored.session.editorSnapshot.content).toBe('# 本地编辑内容')
    expect(ignored.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(ignored.session.externalRuntime.resolutionState).toBe('resolved')
    expect(ignored.session.externalRuntime.lastResolutionResult).toBe('ignored')
    expect(ignored.session.externalRuntime.lastHandledVersionHash).toBeTruthy()

    const ignoredAgain = dispatchWatchCommand(coordinator, ignored.session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003017,
      diskContent: '# 外部版本 1',
      diskStat: {
        mtimeMs: 1700000003017,
      },
    })

    expect(ignoredAgain.effects).toEqual([])
    expect(ignoredAgain.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(ignoredAgain.session.externalRuntime.lastResolutionResult).toBe('ignored')

    const promptChangedAgain = dispatchWatchCommand(coordinator, ignoredAgain.session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003018,
      diskContent: '# 外部版本 2',
      diskStat: {
        mtimeMs: 1700000003018,
      },
    })
    const applied = dispatchWatchCommand(coordinator, promptChangedAgain.session, 'document.external.apply')

    expect(applied.session.editorSnapshot.content).toBe('# 外部版本 2')
    expect(applied.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(applied.session.externalRuntime.resolutionState).toBe('resolved')
    expect(applied.session.externalRuntime.lastResolutionResult).toBe('applied')
    expect(applied.session.externalRuntime.lastHandledVersionHash)
      .toBe(applied.session.diskSnapshot.versionHash)

    const promptChangedThird = dispatchWatchCommand(coordinator, applied.session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003019,
      diskContent: '# 外部版本 3',
      diskStat: {
        mtimeMs: 1700000003019,
      },
    })
    promptChangedThird.session.editorSnapshot.content = '# 外部版本 3'
    promptChangedThird.session.editorSnapshot.revision += 1
    promptChangedThird.session.editorSnapshot.updatedAt = 1700000003020

    const nooped = dispatchWatchCommand(coordinator, promptChangedThird.session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003021,
      diskContent: '# 外部版本 3',
      diskStat: {
        mtimeMs: 1700000003021,
      },
    })

    expect(nooped.session.externalRuntime.pendingExternalChange).toBeNull()
    expect(nooped.session.externalRuntime.resolutionState).toBe('resolved')
    expect(nooped.session.externalRuntime.lastResolutionResult).toBe('noop')
    expect(nooped.session.externalRuntime.lastHandledVersionHash)
      .toBe(nooped.session.diskSnapshot.versionHash)
  })

  it('document.external.apply / ignore 遇到 version mismatch 时必须 no-op，不能错误消费更新后的 pending', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003022,
    })
    const session = createSession()
    session.editorSnapshot.content = '# 本地编辑内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000003022
    session.externalRuntime.lastResolutionResult = 'ignored'
    session.externalRuntime.lastHandledVersionHash = 'handled-before'

    const firstPending = dispatchWatchCommand(coordinator, session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003023,
      diskContent: '# 外部版本 1',
      diskStat: {
        mtimeMs: 1700000003023,
      },
    })
    expect(firstPending.session.externalRuntime.pendingExternalChange?.version).toBe(1)

    const secondPending = dispatchWatchCommand(coordinator, firstPending.session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003024,
      diskContent: '# 外部版本 2',
      diskStat: {
        mtimeMs: 1700000003024,
      },
    })
    expect(secondPending.session.externalRuntime.pendingExternalChange?.version).toBe(2)
    const beforeStaleActionResolutionResult = secondPending.session.externalRuntime.lastResolutionResult
    const beforeStaleActionHandledVersionHash = secondPending.session.externalRuntime.lastHandledVersionHash

    // stale prompt 带着旧 version 回来时，只能 no-op；
    // 否则用户对旧弹窗的操作会错打到当前最新 pending 上。
    const staleApplied = dispatchWatchCommand(coordinator, secondPending.session, 'document.external.apply', {
      version: 1,
    })
    expect(staleApplied.effects).toEqual([])
    expect(staleApplied.session.editorSnapshot.content).toBe('# 本地编辑内容')
    expect(staleApplied.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 2,
      diskContent: '# 外部版本 2',
    })
    expect(staleApplied.session.externalRuntime.lastResolutionResult).toBe(beforeStaleActionResolutionResult)
    expect(staleApplied.session.externalRuntime.lastHandledVersionHash).toBe(beforeStaleActionHandledVersionHash)

    const staleIgnored = dispatchWatchCommand(coordinator, secondPending.session, 'document.external.ignore', {
      version: 1,
    })
    expect(staleIgnored.effects).toEqual([])
    expect(staleIgnored.session.editorSnapshot.content).toBe('# 本地编辑内容')
    expect(staleIgnored.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 2,
      diskContent: '# 外部版本 2',
    })
    expect(staleIgnored.session.externalRuntime.lastResolutionResult).toBe(beforeStaleActionResolutionResult)
    expect(staleIgnored.session.externalRuntime.lastHandledVersionHash).toBe(beforeStaleActionHandledVersionHash)
  })

  it('reconcileAfterSave 只有真正收敛到 pending 版本时才允许 noop，保存出本地版本时必须保留 pending', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003023,
    })
    const session = createSession()
    session.editorSnapshot.content = '# 本地内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000003023

    const watched = dispatchWatchCommand(coordinator, session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003024,
      diskContent: '# 外部版本',
      diskStat: {
        mtimeMs: 1700000003024,
      },
    })

    expect(watched.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 1,
      diskContent: '# 外部版本',
    })
    const pendingVersionHash = watched.session.externalRuntime.pendingExternalChange?.versionHash

    // 这里模拟 save.succeeded 之后的真实会话状态：
    // 用户保存的是“本地内容”，而不是刚刚进来的外部版本。
    // editor/disk 此时会重新一致，但 pending 指向的外部版本实际上并未消失。
    watched.session.documentSource.exists = true
    watched.session.documentSource.lastKnownStat = {
      mtimeMs: 1700000003025,
    }
    watched.session.diskSnapshot.content = '# 本地内容'
    watched.session.diskSnapshot.versionHash = 'local-saved-version'
    watched.session.diskSnapshot.exists = true
    watched.session.diskSnapshot.stat = {
      mtimeMs: 1700000003025,
    }
    watched.session.editorSnapshot.content = '# 本地内容'

    const reconciled = coordinator.reconcileAfterSave(watched.session)

    expect(reconciled.effects).toEqual([])
    expect(reconciled.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 1,
      versionHash: pendingVersionHash,
      diskContent: '# 外部版本',
    })
    expect(reconciled.session.externalRuntime.resolutionState).toBe('pending-user')
    expect(reconciled.session.externalRuntime.lastResolutionResult).toBe('none')
    expect(reconciled.session.externalRuntime.lastHandledVersionHash).toBeNull()
  })

  it('同一路径 rebind 导致 bindingToken 变化时，reconcileAfterSave 不能把旧 pending 当 stale 丢掉', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003026,
    })
    const session = createSession()
    session.editorSnapshot.content = '# 本地内容'
    session.editorSnapshot.revision = 1
    session.editorSnapshot.updatedAt = 1700000003026

    const watched = dispatchWatchCommand(coordinator, session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003027,
      diskContent: '# 外部版本',
      diskStat: {
        mtimeMs: 1700000003027,
      },
    })
    const pendingVersionHash = watched.session.externalRuntime.pendingExternalChange?.versionHash

    const rebindRequested = dispatchWatchCommand(coordinator, watched.session, 'watch.error', {
      bindingToken: 1,
      watchingPath: 'C:/docs/demo.md',
      error: {
        name: 'Error',
        message: 'watch crashed',
        code: 'EIO',
      },
    })

    expect(rebindRequested.session.watchRuntime.bindingToken).toBe(2)
    expect(rebindRequested.session.watchRuntime.watchingPath).toBe('C:/docs/demo.md')

    // 这里模拟“同一路径重绑期间，本地保存成功”的 save 后会话快照。
    // token 虽然已经换成 2，但 pending 指向的外部版本仍然属于当前这份文档。
    rebindRequested.session.documentSource.path = 'C:/docs/demo.md'
    rebindRequested.session.documentSource.exists = true
    rebindRequested.session.documentSource.lastKnownStat = {
      mtimeMs: 1700000003028,
    }
    rebindRequested.session.diskSnapshot.content = '# 本地内容'
    rebindRequested.session.diskSnapshot.versionHash = 'local-saved-version'
    rebindRequested.session.diskSnapshot.exists = true
    rebindRequested.session.diskSnapshot.stat = {
      mtimeMs: 1700000003028,
    }
    rebindRequested.session.editorSnapshot.content = '# 本地内容'

    const reconciled = coordinator.reconcileAfterSave(rebindRequested.session)

    expect(reconciled.effects).toEqual([])
    expect(reconciled.session.externalRuntime.pendingExternalChange).toMatchObject({
      version: 1,
      versionHash: pendingVersionHash,
      diskContent: '# 外部版本',
      watchBindingToken: 1,
    })
    expect(reconciled.session.externalRuntime.resolutionState).toBe('pending-user')
    expect(reconciled.session.externalRuntime.lastResolutionResult).toBe('none')
    expect(reconciled.session.externalRuntime.lastHandledVersionHash).toBeNull()
  })

  it('watch.error 必须立即发出 warning，并进入 rebinding；失败后再进入 degraded', () => {
    const coordinator = createWatchCoordinator({
      now: () => 1700000003021,
    })
    const session = createSession()

    const rebindRequested = dispatchWatchCommand(coordinator, session, 'watch.error', {
      bindingToken: 1,
      watchingPath: 'C:/docs/demo.md',
      error: {
        name: 'Error',
        message: 'watch crashed',
        code: 'EIO',
      },
    })

    expect(rebindRequested.session.watchRuntime.status).toBe('rebinding')
    expect(rebindRequested.session.watchRuntime.bindingToken).toBe(2)
    expect(rebindRequested.session.watchRuntime.lastError).toEqual({
      name: 'Error',
      message: 'watch crashed',
      code: 'EIO',
    })
    expect(rebindRequested.effects).toEqual([
      {
        type: 'notify-watch-warning',
        level: 'warning',
        reason: 'watch-error',
        error: {
          name: 'Error',
          message: 'watch crashed',
          code: 'EIO',
        },
      },
      {
        type: 'rebind-watch',
        bindingToken: 2,
        watchingPath: 'C:/docs/demo.md',
      },
    ])

    const staleBound = dispatchWatchCommand(coordinator, rebindRequested.session, 'watch.bound', {
      bindingToken: 1,
      watchingPath: 'C:/docs/demo.md',
      watchingDirectoryPath: 'C:/docs',
    })

    expect(staleBound.session.watchRuntime.status).toBe('rebinding')
    expect(staleBound.session.watchRuntime.bindingToken).toBe(2)

    const rebindFailed = dispatchWatchCommand(coordinator, staleBound.session, 'watch.rebind-failed', {
      bindingToken: 2,
      watchingPath: 'C:/docs/demo.md',
      error: {
        name: 'Error',
        message: 'rebind failed',
        code: 'EACCES',
      },
    })

    expect(rebindFailed.session.watchRuntime.status).toBe('degraded')
    expect(rebindFailed.session.watchRuntime.bindingToken).toBe(2)
    expect(rebindFailed.session.watchRuntime.lastError).toEqual({
      name: 'Error',
      message: 'rebind failed',
      code: 'EACCES',
    })
    expect(rebindFailed.effects).toEqual([
      {
        type: 'notify-watch-warning',
        level: 'warning',
        reason: 'watch-rebind-failed',
        error: {
          name: 'Error',
          message: 'rebind failed',
          code: 'EACCES',
        },
      },
    ])

    const staleChanged = dispatchWatchCommand(coordinator, rebindFailed.session, 'watch.file-changed', {
      bindingToken: 1,
      observedAt: 1700000003022,
      diskContent: '# 旧 token 的迟到内容',
      diskStat: {
        mtimeMs: 1700000003022,
      },
    })

    expect(staleChanged.session.diskSnapshot.content).toBe('# 原始磁盘内容')
    expect(staleChanged.session.watchRuntime.status).toBe('degraded')
  })
})
