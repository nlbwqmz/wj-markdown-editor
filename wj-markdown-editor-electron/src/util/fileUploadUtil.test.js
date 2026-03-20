import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  copyFile,
  createId,
  createUniqueFileName,
  ensureDirSafe,
  pathExists,
  removePathSplit,
  send,
  windowGetDocumentContext,
} = vi.hoisted(() => ({
  copyFile: vi.fn(),
  createId: vi.fn(() => 'file-loading-key'),
  createUniqueFileName: vi.fn(fileName => path.basename(fileName)),
  ensureDirSafe: vi.fn(),
  pathExists: vi.fn(),
  removePathSplit: vi.fn(targetPath => targetPath),
  send: vi.fn(),
  windowGetDocumentContext: vi.fn(),
}))

vi.mock('fs-extra', () => ({
  default: {
    copyFile,
    pathExists,
  },
}))

vi.mock('./channel/sendUtil.js', () => ({
  default: {
    send,
  },
}))

vi.mock('./commonUtil.js', () => ({
  default: {
    createId,
    createUniqueFileName,
    ensureDirSafe,
    removePathSplit,
  },
}))

vi.mock('./document-session/windowLifecycleService.js', () => ({
  default: {
    getDocumentContext: windowGetDocumentContext,
  },
}))

describe('fileUploadUtil', () => {
  beforeEach(() => {
    vi.resetModules()
    copyFile.mockReset()
    createId.mockReset()
    createUniqueFileName.mockReset()
    ensureDirSafe.mockReset()
    pathExists.mockReset()
    removePathSplit.mockReset()
    send.mockReset()
    windowGetDocumentContext.mockReset()

    createId.mockReturnValue('file-loading-key')
    createUniqueFileName.mockImplementation(fileName => path.basename(fileName))
    pathExists.mockResolvedValue(true)
    removePathSplit.mockImplementation(targetPath => targetPath)
    windowGetDocumentContext.mockReturnValue({
      path: 'D:/docs/demo.md',
    })
  })

  it('相对路径文件保存成功后，必须返回稳定相对路径并发送成功提示', async () => {
    const { default: fileUploadUtil } = await import('./fileUploadUtil.js')
    const win = { id: 1 }

    const result = await fileUploadUtil.save({
      win,
    }, 'C:/upload/demo.pdf', {
      fileMode: '4',
      fileRelativePath: 'files',
    })

    expect(result).toEqual({ name: 'demo.pdf', path: 'files/demo.pdf' })
    expect(ensureDirSafe).toHaveBeenCalled()
    expect(copyFile).toHaveBeenCalledWith('C:/upload/demo.pdf', expect.stringMatching(/[\\/]files[\\/]demo\.pdf$/))
    expect(send).toHaveBeenCalledWith(win, expect.objectContaining({
      event: 'message',
      data: expect.objectContaining({
        type: 'success',
        content: 'message.theFileIsSavedSuccessfully',
        duration: 3,
        key: 'file-loading-key',
      }),
    }))
  })
})
