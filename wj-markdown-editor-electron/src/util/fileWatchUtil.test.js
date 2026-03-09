import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function createFilePath(...parts) {
  return path.join(path.resolve('virtual-watch-root'), ...parts)
}

function createMissingError() {
  const error = new Error('ENOENT: no such file or directory')
  error.code = 'ENOENT'
  return error
}

describe('fileWatchUtil', () => {
  beforeEach(() => {
    fileWatchUtil.resetRegistryForTest()
  })

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

  it('应该在忽略后清理状态，并抑制同一版本的重复事件', () => {
    const state = fileWatchUtil.createWatchState()

    const firstResult = fileWatchUtil.resolveExternalChange(state, '# 外部版本 1')
    expect(firstResult.changed).toBe(true)
    expect(firstResult.change.version).toBe(1)

    fileWatchUtil.ignorePendingChange(state)

    expect(state.pendingChange).toBeNull()

    const secondResult = fileWatchUtil.resolveExternalChange(state, '# 外部版本 1')
    expect(secondResult.changed).toBe(false)
    expect(secondResult.reason).toBe('handled')
    expect(state.currentVersion).toBe(1)
    expect(state.pendingChange).toBeNull()
  })

  it('同一版本在已处理后再次出现时，即使经过较长时间也不应重复创建待处理项', () => {
    const state = fileWatchUtil.createWatchState()

    const firstResult = fileWatchUtil.resolveExternalChange(state, '# 外部版本 1')
    expect(firstResult.changed).toBe(true)

    fileWatchUtil.ignorePendingChange(state)

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

  it('同一父目录下多个文件应共享同一个 watcher，并在最后一个订阅释放后关闭', () => {
    const stateA = fileWatchUtil.createWatchState()
    const stateB = fileWatchUtil.createWatchState()
    const dirPath = createFilePath('docs')
    const filePathA = path.join(dirPath, 'first.md')
    const filePathB = path.join(dirPath, 'second.md')
    const close = vi.fn()
    const watch = vi.fn((_targetPath, _listener) => ({ close }))

    fileWatchUtil.startWatching({
      state: stateA,
      filePath: filePathA,
      watch,
      readFile: vi.fn().mockResolvedValue('# first'),
      onExternalChange: vi.fn(),
    })

    fileWatchUtil.startWatching({
      state: stateB,
      filePath: filePathB,
      watch,
      readFile: vi.fn().mockResolvedValue('# second'),
      onExternalChange: vi.fn(),
    })

    expect(watch).toHaveBeenCalledTimes(1)
    expect(watch).toHaveBeenCalledWith(dirPath, expect.any(Function))

    fileWatchUtil.stopWatching(stateA)
    expect(close).not.toHaveBeenCalled()

    fileWatchUtil.stopWatching(stateB)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('同一文件被多个窗口订阅时，应共享读盘结果并向每个窗口分发变化', async () => {
    const stateA = fileWatchUtil.createWatchState()
    const stateB = fileWatchUtil.createWatchState()
    const filePath = createFilePath('docs', 'shared.md')
    const readFile = vi.fn().mockResolvedValue('# 外部版本 1')
    const onExternalChangeA = vi.fn()
    const onExternalChangeB = vi.fn()
    let listener

    const watch = vi.fn((_targetPath, callback) => {
      listener = callback
      return { close: vi.fn() }
    })

    fileWatchUtil.startWatching({
      state: stateA,
      filePath,
      debounceMs: 0,
      readFile,
      onExternalChange: onExternalChangeA,
      watch,
    })

    fileWatchUtil.startWatching({
      state: stateB,
      filePath,
      debounceMs: 0,
      readFile,
      onExternalChange: onExternalChangeB,
      watch,
    })

    await listener('change', path.basename(filePath))
    await sleep()
    await sleep()

    expect(readFile).toHaveBeenCalledTimes(1)
    expect(onExternalChangeA).toHaveBeenCalledTimes(1)
    expect(onExternalChangeB).toHaveBeenCalledTimes(1)
    expect(onExternalChangeA.mock.calls[0][0]).toMatchObject({
      version: 1,
      content: '# 外部版本 1',
    })
    expect(onExternalChangeB.mock.calls[0][0]).toMatchObject({
      version: 1,
      content: '# 外部版本 1',
    })
  })

  it('目录事件未提供文件名时，应对目录下所有已订阅文件触发检查', async () => {
    const stateA = fileWatchUtil.createWatchState()
    const stateB = fileWatchUtil.createWatchState()
    const filePathA = createFilePath('docs', 'first.md')
    const filePathB = createFilePath('docs', 'second.md')
    const readFileA = vi.fn().mockResolvedValue('# first')
    const readFileB = vi.fn().mockResolvedValue('# second')
    const onExternalChangeA = vi.fn()
    const onExternalChangeB = vi.fn()
    let listener

    const watch = vi.fn((_targetPath, callback) => {
      listener = callback
      return { close: vi.fn() }
    })

    fileWatchUtil.startWatching({
      state: stateA,
      filePath: filePathA,
      debounceMs: 0,
      readFile: readFileA,
      onExternalChange: onExternalChangeA,
      watch,
    })

    fileWatchUtil.startWatching({
      state: stateB,
      filePath: filePathB,
      debounceMs: 0,
      readFile: readFileB,
      onExternalChange: onExternalChangeB,
      watch,
    })

    await listener('rename')
    await sleep()
    await sleep()

    expect(readFileA).toHaveBeenCalledTimes(1)
    expect(readFileB).toHaveBeenCalledTimes(1)
    expect(onExternalChangeA).toHaveBeenCalledTimes(1)
    expect(onExternalChangeB).toHaveBeenCalledTimes(1)
  })

  it('文件被移走时应按缺失处理，原路径重新出现后应恢复监听', async () => {
    const state = fileWatchUtil.createWatchState()
    const filePath = createFilePath('docs', 'rename-target.md')
    const readFile = vi.fn()
      .mockRejectedValueOnce(createMissingError())
      .mockResolvedValueOnce('# 恢复后的内容')
    const onExternalChange = vi.fn()
    const onMissing = vi.fn()
    const onRestored = vi.fn()
    let listener

    fileWatchUtil.startWatching({
      state,
      filePath,
      debounceMs: 0,
      readFile,
      onExternalChange,
      onMissing,
      onRestored,
      watch: (_targetPath, callback) => {
        listener = callback
        return { close: vi.fn() }
      },
    })

    await listener('rename', path.basename(filePath))
    await sleep()
    await sleep()

    expect(onMissing).toHaveBeenCalledTimes(1)
    expect(onExternalChange).not.toHaveBeenCalled()

    await listener('rename', path.basename(filePath))
    await sleep()
    await sleep()

    expect(onRestored).toHaveBeenCalledTimes(1)
    expect(onExternalChange).toHaveBeenCalledTimes(1)
    expect(onExternalChange.mock.calls[0][0]).toMatchObject({
      version: 1,
      content: '# 恢复后的内容',
    })
  })

  it('停止监听后不应再继续分发文件变化', async () => {
    const state = fileWatchUtil.createWatchState()
    const filePath = createFilePath('docs', 'demo.md')
    const onExternalChange = vi.fn()
    const close = vi.fn()
    let listener

    fileWatchUtil.startWatching({
      state,
      filePath,
      debounceMs: 0,
      readFile: vi.fn().mockResolvedValue('# 外部版本 1'),
      onExternalChange,
      watch: (_targetPath, callback) => {
        listener = callback
        return { close }
      },
    })

    fileWatchUtil.stopWatching(state)
    await listener('change', path.basename(filePath))
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
    const firstFilePath = createFilePath('docs-a', 'first.md')
    const secondFilePath = createFilePath('docs-b', 'second.md')

    fileWatchUtil.markInternalSave(state, '# 已保存内容')
    fileWatchUtil.resolveExternalChange(state, '# 外部版本 1')
    fileWatchUtil.ignorePendingChange(state)

    fileWatchUtil.startWatching({
      state,
      filePath: firstFilePath,
      debounceMs: 0,
      readFile: vi.fn().mockResolvedValue('# first'),
      onExternalChange: firstOnExternalChange,
      watch: (_targetPath, callback) => {
        listeners.push(callback)
        return { close: vi.fn() }
      },
    })

    fileWatchUtil.startWatching({
      state,
      filePath: secondFilePath,
      debounceMs: 0,
      readFile: vi.fn().mockResolvedValue('# second'),
      onExternalChange: secondOnExternalChange,
      watch: (_targetPath, callback) => {
        listeners.push(callback)
        return { close: vi.fn() }
      },
    })

    await listeners[0]('change', path.basename(firstFilePath))
    await sleep()

    expect(firstOnExternalChange).not.toHaveBeenCalled()
    expect(secondOnExternalChange).not.toHaveBeenCalled()
    expect(state.watchingPath).toBe(secondFilePath)
    expect(state.currentVersion).toBe(0)
    expect(state.lastInternalSaveAt).toBe(0)
    expect(state.lastInternalSavedVersion).toBeNull()
    expect(state.pendingChange).toBeNull()
  })

  it('异步读盘乱序返回时，旧订阅结果不应覆盖当前状态', async () => {
    const state = fileWatchUtil.createWatchState()
    const listeners = []
    const firstRead = createDeferred()
    const secondRead = createDeferred()
    const firstOnExternalChange = vi.fn()
    const secondOnExternalChange = vi.fn()
    const firstFilePath = createFilePath('docs-a', 'first.md')
    const secondFilePath = createFilePath('docs-b', 'second.md')

    fileWatchUtil.startWatching({
      state,
      filePath: firstFilePath,
      debounceMs: 0,
      readFile: vi.fn().mockImplementation(() => firstRead.promise),
      onExternalChange: firstOnExternalChange,
      watch: (_targetPath, callback) => {
        listeners.push(callback)
        return { close: vi.fn() }
      },
    })

    await listeners[0]('change', path.basename(firstFilePath))
    await sleep()

    fileWatchUtil.startWatching({
      state,
      filePath: secondFilePath,
      debounceMs: 0,
      readFile: vi.fn().mockImplementation(() => secondRead.promise),
      onExternalChange: secondOnExternalChange,
      watch: (_targetPath, callback) => {
        listeners.push(callback)
        return { close: vi.fn() }
      },
    })

    await listeners[1]('change', path.basename(secondFilePath))
    await sleep()

    secondRead.resolve('# 新文件版本')
    await sleep()
    await sleep()

    firstRead.resolve('# 旧文件版本')
    await sleep()
    await sleep()

    expect(firstOnExternalChange).not.toHaveBeenCalled()
    expect(secondOnExternalChange).toHaveBeenCalledTimes(1)
    expect(state.watchingPath).toBe(secondFilePath)
    expect(state.currentVersion).toBe(1)
    expect(state.pendingChange).toEqual({
      version: 1,
      versionHash: fileWatchUtil.createContentVersion('# 新文件版本'),
      content: '# 新文件版本',
    })
  })
})
