import { beforeEach, describe, expect, it, vi } from 'vitest'

import resourceFileUtil from './resourceFileUtil.js'

const { pathExists, remove } = vi.hoisted(() => {
  return {
    pathExists: vi.fn(),
    remove: vi.fn(),
  }
})

vi.mock('fs-extra', () => {
  return {
    default: {
      pathExists,
      remove,
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
  })

  it('文件存在时，应该删除本地资源', async () => {
    pathExists.mockResolvedValue(true)

    const result = await resourceFileUtil.deleteLocalResource({
      path: 'D:\\docs\\note.md',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toBe(true)
    expect(pathExists).toHaveBeenCalledWith('D:\\docs\\assets\\demo.png')
    expect(remove).toHaveBeenCalledWith('D:\\docs\\assets\\demo.png')
  })

  it('文件不存在时，应该忽略删除并继续返回成功', async () => {
    pathExists.mockResolvedValue(false)

    const result = await resourceFileUtil.deleteLocalResource({
      path: 'D:\\docs\\note.md',
    }, 'wj://2e2f6173736574732f64656d6f2e706e67')

    expect(result).toBe(true)
    expect(pathExists).toHaveBeenCalledWith('D:\\docs\\assets\\demo.png')
    expect(remove).not.toHaveBeenCalled()
  })
})
