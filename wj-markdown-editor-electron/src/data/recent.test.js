import { beforeEach, describe, expect, it, vi } from 'vitest'

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
})
