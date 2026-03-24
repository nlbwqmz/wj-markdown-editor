import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appGetAppPath,
  appGetPath,
  appIsPackaged,
  ensureDirMock,
  pathExistsMock,
  readFileMock,
  writeFileMock,
} = vi.hoisted(() => {
  return {
    appGetAppPath: vi.fn(() => 'D:/code/wj-markdown-editor/wj-markdown-editor-electron'),
    appGetPath: vi.fn(() => 'C:/Users/robot/Documents'),
    appIsPackaged: false,
    ensureDirMock: vi.fn(),
    pathExistsMock: vi.fn(),
    readFileMock: vi.fn(),
    writeFileMock: vi.fn(),
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
      pathExists: pathExistsMock,
      readFile: readFileMock,
      writeFile: writeFileMock,
    },
  }
})

describe('recent 数据存储', () => {
  let consoleErrorSpy

  beforeEach(() => {
    vi.resetModules()
    ensureDirMock.mockReset()
    pathExistsMock.mockReset()
    readFileMock.mockReset()
    writeFileMock.mockReset()
    ensureDirMock.mockResolvedValue(undefined)
    pathExistsMock.mockResolvedValue(false)
    readFileMock.mockResolvedValue('[]')
    writeFileMock.mockResolvedValue(undefined)
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
  })

  it('initRecent 读取到历史重复项时，必须在内存与落盘层都完成去重', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue(JSON.stringify([
      'D:/docs/demo.md',
      'D:/docs/demo.md',
      'D:/docs/other.md',
    ]))

    const { default: recent } = await import('./recent.js')
    await recent.initRecent(10, vi.fn())

    expect(recent.get()).toEqual([
      {
        name: 'demo.md',
        path: 'D:/docs/demo.md',
      },
      {
        name: 'other.md',
        path: 'D:/docs/other.md',
      },
    ])
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]recent\.json$/),
      JSON.stringify([
        'D:/docs/demo.md',
        'D:/docs/other.md',
      ]),
      'utf-8',
    )
  })

  it('add 命中历史遗留的重复路径时，必须一次性清干净，不能只删第一条', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue(JSON.stringify([
      'D:/docs/demo.md',
      'D:/docs/demo.md',
      'D:/docs/other.md',
    ]))

    const { default: recent } = await import('./recent.js')
    await recent.initRecent(10, vi.fn())
    writeFileMock.mockClear()

    await recent.add('D:/docs/demo.md')

    expect(recent.get()).toEqual([
      {
        name: 'demo.md',
        path: 'D:/docs/demo.md',
      },
      {
        name: 'other.md',
        path: 'D:/docs/other.md',
      },
    ])
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]recent\.json$/),
      JSON.stringify([
        'D:/docs/demo.md',
        'D:/docs/other.md',
      ]),
      'utf-8',
    )
  })

  it('initRecent 读取到超出上限的 recent 时，必须在启动阶段收敛并回写', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue(JSON.stringify([
      'D:/docs/one.md',
      'D:/docs/two.md',
      'D:/docs/three.md',
    ]))

    const { default: recent } = await import('./recent.js')
    await recent.initRecent(1, vi.fn())

    expect(recent.get()).toEqual([
      {
        name: 'one.md',
        path: 'D:/docs/one.md',
      },
    ])
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]recent\.json$/),
      JSON.stringify([
        'D:/docs/one.md',
      ]),
      'utf-8',
    )
  })

  it('initRecent 接收小数上限时，必须把运行期 maxSize 归一化为向下取整后的整数', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue(JSON.stringify([
      'D:/docs/one.md',
      'D:/docs/two.md',
    ]))
    const callback = vi.fn()

    const { default: recent } = await import('./recent.js')
    await recent.initRecent(0.5, callback)
    writeFileMock.mockClear()
    callback.mockClear()

    expect(recent.createStateSnapshot().maxSize).toBe(0)

    await recent.add('D:/docs/three.md')

    expect(recent.get()).toEqual([])
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]recent\.json$/),
      JSON.stringify([]),
      'utf-8',
    )
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith([])
  })

  it('setMax 成功时只更新运行期上限，不立即修改 recent 列表、磁盘或 callback', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue(JSON.stringify([
      'D:/docs/one.md',
      'D:/docs/two.md',
      'D:/docs/three.md',
    ]))
    const callback = vi.fn()

    const { default: recent } = await import('./recent.js')
    await recent.initRecent(3, callback)
    writeFileMock.mockClear()
    callback.mockClear()

    await expect(recent.setMax(1)).resolves.toBeUndefined()

    expect(recent.get()).toEqual([
      {
        name: 'one.md',
        path: 'D:/docs/one.md',
      },
      {
        name: 'two.md',
        path: 'D:/docs/two.md',
      },
      {
        name: 'three.md',
        path: 'D:/docs/three.md',
      },
    ])
    expect(writeFileMock).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it('setMax 更新上限后，下一次 add 必须按新上限统一收敛', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue(JSON.stringify([
      'D:/docs/one.md',
      'D:/docs/two.md',
      'D:/docs/three.md',
    ]))
    const callback = vi.fn()

    const { default: recent } = await import('./recent.js')
    await recent.initRecent(3, callback)
    await recent.setMax(1, { notify: false })
    writeFileMock.mockClear()
    callback.mockClear()

    await recent.add('D:/docs/four.md')

    expect(recent.get()).toEqual([
      {
        name: 'four.md',
        path: 'D:/docs/four.md',
      },
    ])
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]recent\.json$/),
      JSON.stringify([
        'D:/docs/four.md',
      ]),
      'utf-8',
    )
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('notifyCurrentState 必须显式广播当前 recent 列表', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue(JSON.stringify([
      'D:/docs/one.md',
      'D:/docs/two.md',
    ]))
    const callback = vi.fn()

    const { default: recent } = await import('./recent.js')
    await recent.initRecent(3, callback)
    callback.mockClear()

    recent.notifyCurrentState()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith([
      {
        name: 'one.md',
        path: 'D:/docs/one.md',
      },
      {
        name: 'two.md',
        path: 'D:/docs/two.md',
      },
    ])
  })

  it('restoreState 必须把 recent 的内存与磁盘都恢复到快照，且不能触发 callback', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue(JSON.stringify([
      'D:/docs/one.md',
      'D:/docs/two.md',
      'D:/docs/three.md',
    ]))
    const callback = vi.fn()

    const { default: recent } = await import('./recent.js')
    await recent.initRecent(3, callback)
    writeFileMock.mockClear()

    const snapshot = recent.createStateSnapshot()
    await recent.add('D:/docs/four.md')
    callback.mockClear()
    writeFileMock.mockClear()

    await expect(recent.restoreState(snapshot)).resolves.toBeUndefined()

    expect(recent.get()).toEqual([
      {
        name: 'one.md',
        path: 'D:/docs/one.md',
      },
      {
        name: 'two.md',
        path: 'D:/docs/two.md',
      },
      {
        name: 'three.md',
        path: 'D:/docs/three.md',
      },
    ])
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]recent\.json$/),
      JSON.stringify([
        'D:/docs/one.md',
        'D:/docs/two.md',
        'D:/docs/three.md',
      ]),
      'utf-8',
    )
    expect(callback).not.toHaveBeenCalled()
  })

  it('restoreState 写盘失败时，仍必须恢复内存快照并把错误抛给上层', async () => {
    pathExistsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue(JSON.stringify([
      'D:/docs/one.md',
      'D:/docs/two.md',
      'D:/docs/three.md',
    ]))

    const { default: recent } = await import('./recent.js')
    await recent.initRecent(3, vi.fn())

    const snapshot = recent.createStateSnapshot()
    await recent.add('D:/docs/four.md')
    writeFileMock.mockClear()
    writeFileMock.mockRejectedValueOnce(new Error('restore-write-failed'))

    await expect(recent.restoreState(snapshot)).rejects.toThrow('restore-write-failed')
    expect(recent.get()).toEqual([
      {
        name: 'one.md',
        path: 'D:/docs/one.md',
      },
      {
        name: 'two.md',
        path: 'D:/docs/two.md',
      },
      {
        name: 'three.md',
        path: 'D:/docs/three.md',
      },
    ])
  })
})
