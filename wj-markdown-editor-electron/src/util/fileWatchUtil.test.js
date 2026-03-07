import { describe, expect, it, vi } from 'vitest'
import fileWatchUtil from './fileWatchUtil.js'

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolveInner, rejectInner) => {
    resolve = resolveInner
    reject = rejectInner
  })
  return { promise, resolve, reject }
}

describe('fileWatchUtil', () => {
  it('应该忽略由软件内部保存触发的同内容变化', () => {
    const state = fileWatchUtil.createWatchState()

    fileWatchUtil.markInternalSave(state, '# 标题')
    const result = fileWatchUtil.resolveExternalChange(state, '# 标题')

    expect(result.changed).toBe(false)
    expect(result.reason).toBe('internal-save')
    expect(state.currentVersion).toBe(0)
    expect(state.pendingChange).toBeNull()
  })

  it('内部保存抑制窗口过期后，相同内容也应按外部变化处理', () => {
    const state = fileWatchUtil.createWatchState()
    state.internalSaveWindowMs = 1

    fileWatchUtil.markInternalSave(state, '# 标题')
    state.lastInternalSaveAt -= 10

    const result = fileWatchUtil.resolveExternalChange(state, '# 标题')

    expect(result.changed).toBe(true)
    expect(result.reason).toBe('external-change')
    expect(result.change.version).toBe(1)
  })

  it('应该在忽略后清理状态，并仅短暂抑制同一版本的重复事件', () => {
    const state = fileWatchUtil.createWatchState()

    const firstResult = fileWatchUtil.resolveExternalChange(state, '# 外部版本 1')
    expect(firstResult.changed).toBe(true)
    expect(firstResult.change.version).toBe(1)

    fileWatchUtil.ignorePendingChange(state)

    expect(state.pendingChange).toBeNull()
    expect(state.ignoredVersionHash).toBeNull()

    const secondResult = fileWatchUtil.resolveExternalChange(state, '# 外部版本 1')
    expect(secondResult.changed).toBe(false)
    expect(secondResult.reason).toBe('handled')
    expect(state.currentVersion).toBe(1)
    expect(state.pendingChange).toBeNull()
  })

  it('应该在新的外部版本出现时递增版本号并更新待处理变化', () => {
    const state = fileWatchUtil.createWatchState()

    const firstResult = fileWatchUtil.resolveExternalChange(state, '# 外部版本 1')
    const secondResult = fileWatchUtil.resolveExternalChange(state, '# 外部版本 2')

    expect(firstResult.changed).toBe(true)
    expect(firstResult.change.version).toBe(1)
    expect(secondResult.changed).toBe(true)
    expect(secondResult.change.version).toBe(2)
    expect(state.currentVersion).toBe(2)
    expect(state.pendingChange).toEqual({
      version: 2,
      versionHash: fileWatchUtil.createContentVersion('# 外部版本 2'),
      content: '# 外部版本 2',
    })
  })

  it('停止监听后不应再继续分发文件变化', async () => {
    const state = fileWatchUtil.createWatchState()
    const onExternalChange = vi.fn()
    const close = vi.fn()
    let listener

    fileWatchUtil.startWatching({
      state,
      filePath: 'D:/demo.md',
      debounceMs: 0,
      readFile: vi.fn().mockResolvedValue('# 外部版本 1'),
      onExternalChange,
      watch: (_filePath, callback) => {
        listener = callback
        return { close }
      },
    })

    fileWatchUtil.stopWatching(state)
    await listener()
    await sleep()

    expect(close).toHaveBeenCalledTimes(1)
    expect(onExternalChange).not.toHaveBeenCalled()
    expect(state.stopped).toBe(true)
    expect(state.pendingChange).toBeNull()
  })

  it('重新开始监听后，旧回调不应污染新文件状态，且应重置旧文件跟踪信息', async () => {
    const state = fileWatchUtil.createWatchState()
    const listeners = []
    const firstOnExternalChange = vi.fn()
    const secondOnExternalChange = vi.fn()

    fileWatchUtil.markInternalSave(state, '# 已保存内容')
    fileWatchUtil.resolveExternalChange(state, '# 外部版本 1')
    fileWatchUtil.ignorePendingChange(state)

    fileWatchUtil.startWatching({
      state,
      filePath: 'D:/first.md',
      debounceMs: 0,
      readFile: vi.fn().mockResolvedValue('# first'),
      onExternalChange: firstOnExternalChange,
      watch: (_filePath, callback) => {
        listeners.push(callback)
        return { close: vi.fn() }
      },
    })

    fileWatchUtil.startWatching({
      state,
      filePath: 'D:/second.md',
      debounceMs: 0,
      readFile: vi.fn().mockResolvedValue('# second'),
      onExternalChange: secondOnExternalChange,
      watch: (_filePath, callback) => {
        listeners.push(callback)
        return { close: vi.fn() }
      },
    })

    await listeners[0]()
    await sleep()

    expect(firstOnExternalChange).not.toHaveBeenCalled()
    expect(secondOnExternalChange).not.toHaveBeenCalled()
    expect(state.watchingPath).toBe('D:/second.md')
    expect(state.currentVersion).toBe(0)
    expect(state.lastInternalSaveAt).toBe(0)
    expect(state.lastInternalSavedVersion).toBeNull()
    expect(state.ignoredVersionHash).toBeNull()
    expect(state.pendingChange).toBeNull()
  })

  it('异步读盘乱序返回时，旧代际结果不应覆盖当前状态', async () => {
    const state = fileWatchUtil.createWatchState()
    const listeners = []
    const firstRead = createDeferred()
    const secondRead = createDeferred()
    const firstOnExternalChange = vi.fn()
    const secondOnExternalChange = vi.fn()

    fileWatchUtil.startWatching({
      state,
      filePath: 'D:/first.md',
      debounceMs: 0,
      readFile: vi.fn().mockImplementation(() => firstRead.promise),
      onExternalChange: firstOnExternalChange,
      watch: (_filePath, callback) => {
        listeners.push(callback)
        return { close: vi.fn() }
      },
    })

    await listeners[0]()
    await sleep()

    fileWatchUtil.startWatching({
      state,
      filePath: 'D:/second.md',
      debounceMs: 0,
      readFile: vi.fn().mockImplementation(() => secondRead.promise),
      onExternalChange: secondOnExternalChange,
      watch: (_filePath, callback) => {
        listeners.push(callback)
        return { close: vi.fn() }
      },
    })

    await listeners[1]()
    await sleep()

    secondRead.resolve('# 新文件版本')
    await sleep()
    await sleep()

    firstRead.resolve('# 旧文件版本')
    await sleep()
    await sleep()

    expect(firstOnExternalChange).not.toHaveBeenCalled()
    expect(secondOnExternalChange).toHaveBeenCalledTimes(1)
    expect(state.watchingPath).toBe('D:/second.md')
    expect(state.currentVersion).toBe(1)
    expect(state.pendingChange).toEqual({
      version: 1,
      versionHash: fileWatchUtil.createContentVersion('# 新文件版本'),
      content: '# 新文件版本',
    })
  })
})
