import { beforeEach, describe, expect, it, vi } from 'vitest'

import resourceFileUtil from './resourceFileUtil.js'

const { pathExists, pathExistsSync, remove, stat } = vi.hoisted(() => {
  return {
    pathExists: vi.fn(),
    pathExistsSync: vi.fn(),
    remove: vi.fn(),
    stat: vi.fn(),
  }
})

vi.mock('fs-extra', () => {
  return {
    default: {
      pathExists,
      pathExistsSync,
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

  it('非法 payload 时，应该安全返回 null 而不是抛错', () => {
    const result = resourceFileUtil.resolveLocalResourcePath({
      path: 'D:\\docs\\note.md',
    }, 'wj://zz')

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
      reason: 'invalid-resource-url',
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('资源 payload 非法时，应该返回 invalid-resource-payload 且不抛错', async () => {
    const result = await resourceFileUtil.deleteLocalResource({
      path: 'D:\\docs\\note.md',
    }, 'wj://zz')

    expect(result).toEqual({
      ok: false,
      removed: false,
      reason: 'invalid-resource-payload',
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

  it('资源 payload 非法时，应该返回 invalid-resource-payload 且不抛错', async () => {
    const showItemInFolder = vi.fn()

    const result = await resourceFileUtil.openLocalResourceInFolder({
      path: 'D:\\docs\\note.md',
    }, 'wj://zz', showItemInFolder)

    expect(result).toEqual({
      ok: false,
      opened: false,
      reason: 'invalid-resource-payload',
      path: null,
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
      reason: 'resolved',
      decodedPath: './assets/demo.png',
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
      reason: 'resolved',
      decodedPath: './assets',
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
      reason: 'resolved',
      decodedPath: './assets/demo.png',
      exists: false,
      isDirectory: false,
      isFile: false,
      path: 'D:\\docs\\assets\\demo.png',
    })
    expect(stat).not.toHaveBeenCalled()
  })

  it('资源 payload 非法时，应该返回 invalid-resource-payload 且不抛错', async () => {
    const result = await resourceFileUtil.getLocalResourceInfo({
      path: 'D:\\docs\\note.md',
    }, 'wj://zz')

    expect(result).toEqual({
      ok: false,
      reason: 'invalid-resource-payload',
      decodedPath: null,
      exists: false,
      isDirectory: false,
      isFile: false,
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
  })

  it('当前文件未保存且资源为相对路径时，应该返回 relative-resource-without-document', async () => {
    const result = await resourceFileUtil.getLocalResourceInfo({
      path: '',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toEqual({
      ok: false,
      reason: 'relative-resource-without-document',
      decodedPath: './assets/demo.png',
      exists: false,
      isDirectory: false,
      isFile: false,
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
  })
})

describe('resourceFileUtil.getLocalResourceComparableKey', () => {
  beforeEach(() => {
    pathExistsSync.mockReset()
  })

  it('完整路径文件存在且文件名包含 # 时，应优先按完整路径生成比较 key', () => {
    pathExistsSync.mockImplementation(targetPath => targetPath === 'D:\\docs\\assets\\a#b.md')

    const result = resourceFileUtil.getLocalResourceComparableKey({
      path: 'D:\\docs\\note.md',
    }, './assets/a#b.md')

    expect(result).toBe('wj-local-file:d:/docs/assets/a#b.md')
  })

  it('完整路径不存在但去掉 hash 后的文件存在时，应按真实文件路径生成比较 key', () => {
    pathExistsSync.mockImplementation((targetPath) => {
      return targetPath === 'D:\\docs\\docs\\index.html'
    })

    const result = resourceFileUtil.getLocalResourceComparableKey({
      path: 'D:\\docs\\note.md',
    }, './docs/index.html#guide')

    expect(result).toBe('wj-local-file:d:/docs/docs/index.html')
  })

  it('已保存文档中的普通相对路径即使文件不存在，也应返回可比较 key', () => {
    pathExistsSync.mockReturnValue(false)

    const result = resourceFileUtil.getLocalResourceComparableKey({
      path: 'D:\\docs\\note.md',
    }, './assets/demo.png')

    expect(result).toBe('wj-local-file:d:/docs/assets/demo.png')
  })

  it('未保存文档中的相对路径且包含 # 时，无法证明资源身份时应返回 null', () => {
    pathExistsSync.mockReturnValue(false)

    const result = resourceFileUtil.getLocalResourceComparableKey({
      path: '',
    }, './docs/index.html#guide')

    expect(result).toBeNull()
  })
})
