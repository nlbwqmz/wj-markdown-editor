import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appGetAppPath,
  appGetPath,
  appIsPackaged,
  ensureDirMock,
  ensureDirSyncMock,
  pathExistsMock,
  readFileMock,
  writeFileMock,
  writeFileSyncMock,
} = vi.hoisted(() => {
  return {
    appGetAppPath: vi.fn(() => 'D:/code/wj-markdown-editor/wj-markdown-editor-electron'),
    appGetPath: vi.fn(() => 'C:/Users/robot/Documents'),
    appIsPackaged: false,
    ensureDirMock: vi.fn(),
    ensureDirSyncMock: vi.fn(),
    pathExistsMock: vi.fn(),
    readFileMock: vi.fn(),
    writeFileMock: vi.fn(),
    writeFileSyncMock: vi.fn(),
  }
})

vi.mock('electron', () => {
  return {
    app: {
      isPackaged: appIsPackaged,
      getAppPath: appGetAppPath,
      getPath: appGetPath,
    },
  }
})

vi.mock('fs-extra', () => {
  return {
    default: {
      ensureDir: ensureDirMock,
      ensureDirSync: ensureDirSyncMock,
      pathExists: pathExistsMock,
      readFile: readFileMock,
      writeFile: writeFileMock,
      writeFileSync: writeFileSyncMock,
    },
  }
})

describe('tabGroup 数据存储', () => {
  let consoleErrorSpy

  beforeEach(async () => {
    vi.resetModules()
    ensureDirMock.mockReset().mockResolvedValue(undefined)
    ensureDirSyncMock.mockReset()
    pathExistsMock.mockReset().mockResolvedValue(false)
    readFileMock.mockReset()
    writeFileMock.mockReset().mockResolvedValue(undefined)
    writeFileSyncMock.mockReset()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('没有存档时初始化应得到空标签组', async () => {
    const tabGroup = (await import('./tabGroup.js')).default

    await tabGroup.initTabGroup()

    expect(tabGroup.get()).toEqual({ tabs: [], activeIndex: 0 })
  })

  it('读取存档时应过滤非法路径、去重并夹紧活动下标', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue(JSON.stringify({
      tabs: ['D:/docs/a.md', '', 'D:/docs/a.md', 'D:/docs/b.md', 42],
      activeIndex: 99,
    }))
    const tabGroup = (await import('./tabGroup.js')).default

    await tabGroup.initTabGroup()

    expect(tabGroup.get()).toEqual({
      tabs: ['D:/docs/a.md', 'D:/docs/b.md'],
      activeIndex: 1,
    })
  })

  it('存档内容损坏时应退回空标签组，不能抛错', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue('{not-json')
    const tabGroup = (await import('./tabGroup.js')).default

    await expect(tabGroup.initTabGroup()).resolves.toEqual({ tabs: [], activeIndex: 0 })
  })

  it('保存时应写盘并回读同一份归一化结果', async () => {
    const tabGroup = (await import('./tabGroup.js')).default

    const saved = await tabGroup.save({
      tabs: ['D:/docs/a.md', 'D:/docs/a.md', 'D:/docs/b.md'],
      activeIndex: 5,
    })

    expect(saved).toEqual({
      tabs: ['D:/docs/a.md', 'D:/docs/b.md'],
      activeIndex: 1,
    })
    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(writeFileMock.mock.calls[0][1])).toEqual(saved)
  })

  it('写盘失败不能把当前会话打崩，内存值仍然更新', async () => {
    writeFileMock.mockRejectedValue(new Error('disk full'))
    const tabGroup = (await import('./tabGroup.js')).default

    const saved = await tabGroup.save({ tabs: ['D:/docs/a.md'], activeIndex: 0 })

    expect(saved).toEqual({ tabs: ['D:/docs/a.md'], activeIndex: 0 })
    expect(tabGroup.get()).toEqual({ tabs: ['D:/docs/a.md'], activeIndex: 0 })
  })

  it('标签组不套 recentMax 之类的数量上限', async () => {
    const tabGroup = (await import('./tabGroup.js')).default
    const tabs = Array.from({ length: 30 }, (_, index) => `D:/docs/${index}.md`)

    const saved = await tabGroup.save({ tabs, activeIndex: 29 })

    expect(saved.tabs).toHaveLength(30)
    expect(saved.activeIndex).toBe(29)
  })

  it('saveSync 必须同步写盘并回读同一份归一化结果', async () => {
    const tabGroup = (await import('./tabGroup.js')).default

    const saved = tabGroup.saveSync({
      tabs: ['D:/docs/a.md', 'D:/docs/a.md', 'D:/docs/b.md'],
      activeIndex: 5,
    })

    // 关窗链路靠同步写盘，不能返回 Promise
    expect(saved).toEqual({
      tabs: ['D:/docs/a.md', 'D:/docs/b.md'],
      activeIndex: 1,
    })
    expect(ensureDirSyncMock).toHaveBeenCalledTimes(1)
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(writeFileSyncMock.mock.calls[0][1])).toEqual(saved)
  })

  it('saveSync 写盘失败不能抛错，内存值仍然更新', async () => {
    writeFileSyncMock.mockImplementation(() => {
      throw new Error('disk full')
    })
    const tabGroup = (await import('./tabGroup.js')).default

    const saved = tabGroup.saveSync({ tabs: ['D:/docs/a.md'], activeIndex: 0 })

    expect(saved).toEqual({ tabs: ['D:/docs/a.md'], activeIndex: 0 })
    expect(tabGroup.get()).toEqual({ tabs: ['D:/docs/a.md'], activeIndex: 0 })
  })
})
