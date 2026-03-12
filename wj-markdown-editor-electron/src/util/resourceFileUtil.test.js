import { beforeEach, describe, expect, it, vi } from 'vitest'

import resourceFileUtil from './resourceFileUtil.js'

const { pathExists, remove, stat } = vi.hoisted(() => {
  return {
    pathExists: vi.fn(),
    remove: vi.fn(),
    stat: vi.fn(),
  }
})

vi.mock('fs-extra', () => {
  return {
    default: {
      pathExists,
      remove,
      stat,
    },
  }
})

describe('resourceFileUtil.resolveLocalResourcePath', () => {
  it('应该支持解析绝对路径资源 URL', () => {
    const result = resourceFileUtil.resolveLocalResourcePath({
      path: 'D:\\docs\\note.md',
    }, 'wj://443a2f696d616765732f64656d6f2e706e67')

    expect(result).toBe('D:/images/demo.png')
  })

  it('应该将相对路径资源解析到当前 markdown 文件目录', () => {
    const result = resourceFileUtil.resolveLocalResourcePath({
      path: 'D:\\docs\\note.md',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toBe('D:\\docs\\assets\\demo.png')
  })

  it('当前文件未保存时，应该拒绝解析相对路径资源', () => {
    const result = resourceFileUtil.resolveLocalResourcePath({
      path: '',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toBeNull()
  })
})

describe('resourceFileUtil.deleteLocalResource', () => {
  beforeEach(() => {
    pathExists.mockReset()
    remove.mockReset()
    stat.mockReset()
  })

  it('文件存在时，应该删除本地资源', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await resourceFileUtil.deleteLocalResource({
      path: 'D:\\docs\\note.md',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: true,
      removed: true,
      reason: 'deleted',
      path: 'D:\\docs\\assets\\demo.png',
    })
    expect(pathExists).toHaveBeenCalledWith('D:\\docs\\assets\\demo.png')
    expect(stat).toHaveBeenCalledWith('D:\\docs\\assets\\demo.png')
    expect(remove).toHaveBeenCalledWith('D:\\docs\\assets\\demo.png')
  })

  it('文件不存在时，应该忽略删除并继续返回成功', async () => {
    pathExists.mockResolvedValue(false)

    const result = await resourceFileUtil.deleteLocalResource({
      path: 'D:\\docs\\note.md',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: true,
      removed: false,
      reason: 'not-found',
      path: 'D:\\docs\\assets\\demo.png',
    })
    expect(pathExists).toHaveBeenCalledWith('D:\\docs\\assets\\demo.png')
    expect(stat).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('目标是目录时，应该拒绝删除', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false,
    })

    const result = await resourceFileUtil.deleteLocalResource({
      path: 'D:\\docs\\note.md',
    }, 'wj://2e2f617373657473')

    expect(result).toEqual({
      ok: false,
      removed: false,
      reason: 'directory-not-allowed',
      path: 'D:\\docs\\assets',
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('资源地址无法解析时，应该返回失败', async () => {
    const result = await resourceFileUtil.deleteLocalResource({
      path: 'D:\\docs\\note.md',
    }, 'https://example.com/demo.png')

    expect(result).toEqual({
      ok: false,
      removed: false,
      reason: 'invalid-resource',
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('resourceFileUtil.openLocalResourceInFolder', () => {
  beforeEach(() => {
    pathExists.mockReset()
    stat.mockReset()
  })

  it('文件不存在时，应该拒绝在资源管理器中打开', async () => {
    pathExists.mockResolvedValue(false)
    const showItemInFolder = vi.fn()

    const result = await resourceFileUtil.openLocalResourceInFolder({
      path: 'D:\\docs\\note.md',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67', showItemInFolder)

    expect(result).toEqual({
      ok: true,
      opened: false,
      reason: 'not-found',
      path: 'D:\\docs\\assets\\demo.png',
    })
    expect(showItemInFolder).not.toHaveBeenCalled()
  })
})

describe('resourceFileUtil.getLocalResourceInfo', () => {
  beforeEach(() => {
    pathExists.mockReset()
    stat.mockReset()
  })

  it('文件存在时，应该返回文件资源信息', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await resourceFileUtil.getLocalResourceInfo({
      path: 'D:\\docs\\note.md',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: true,
      exists: true,
      isDirectory: false,
      isFile: true,
      path: 'D:\\docs\\assets\\demo.png',
    })
  })

  it('目录存在时，应该返回目录资源信息', async () => {
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false,
    })

    const result = await resourceFileUtil.getLocalResourceInfo({
      path: 'D:\\docs\\note.md',
    }, 'wj://2e2f617373657473')

    expect(result).toEqual({
      ok: true,
      exists: true,
      isDirectory: true,
      isFile: false,
      path: 'D:\\docs\\assets',
    })
  })

  it('文件不存在时，也应该返回可解析路径', async () => {
    pathExists.mockResolvedValue(false)

    const result = await resourceFileUtil.getLocalResourceInfo({
      path: 'D:\\docs\\note.md',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: true,
      exists: false,
      isDirectory: false,
      isFile: false,
      path: 'D:\\docs\\assets\\demo.png',
    })
    expect(stat).not.toHaveBeenCalled()
  })
})
