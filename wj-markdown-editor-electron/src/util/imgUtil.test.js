import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appGetPath,
  base64ToImg,
  createId,
  createUniqueFileName,
  ensureDirSafe,
  removePathSplit,
  send,
  windowGetDocumentContext,
} = vi.hoisted(() => ({
  appGetPath: vi.fn(() => 'C:/temp'),
  base64ToImg: vi.fn(),
  createId: vi.fn(() => 'img-loading-key'),
  createUniqueFileName: vi.fn(fileName => fileName),
  ensureDirSafe: vi.fn(),
  removePathSplit: vi.fn(targetPath => targetPath),
  send: vi.fn(),
  windowGetDocumentContext: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    head: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  app: {
    getPath: appGetPath,
  },
}))

vi.mock('fs-extra', () => ({
  default: {
    createWriteStream: vi.fn(),
    unlink: vi.fn(),
  },
}))

vi.mock('./channel/sendUtil.js', () => ({
  default: {
    send,
  },
}))

vi.mock('./commonUtil.js', () => ({
  default: {
    base64ToImg,
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

vi.mock('./imageBedUtil.js', () => ({
  default: {
    upload: vi.fn(),
  },
}))

describe('imgUtil', () => {
  beforeEach(() => {
    vi.resetModules()
    appGetPath.mockReset()
    base64ToImg.mockReset()
    createId.mockReset()
    createUniqueFileName.mockReset()
    ensureDirSafe.mockReset()
    removePathSplit.mockReset()
    send.mockReset()
    windowGetDocumentContext.mockReset()

    appGetPath.mockReturnValue('C:/temp')
    createId.mockReturnValue('img-loading-key')
    createUniqueFileName.mockImplementation(fileName => fileName)
    removePathSplit.mockImplementation(targetPath => targetPath)
    windowGetDocumentContext.mockReturnValue({
      path: 'D:/docs/demo.md',
    })
  })

  it('显式参数对象保存相对路径本地图片成功后，必须返回稳定相对路径并通过 notify 发送成功提示', async () => {
    const { default: imgUtil } = await import('./imgUtil.js')
    const win = { id: 1 }
    const notify = vi.fn()
    const result = await imgUtil.save({
      win,
      documentPath: 'D:/docs/demo.md',
      data: {
        mode: 'local',
        name: 'image.png',
        base64: 'data:image/png;base64,AAAA',
      },
      config: {
        imgLocal: '4',
        imgNetwork: '4',
        imgRelativePath: 'assets',
      },
      notify,
    })

    expect(result).toEqual({ name: 'image.png', path: 'assets/image.png' })
    expect(ensureDirSafe).toHaveBeenCalled()
    expect(base64ToImg).toHaveBeenCalledWith('data:image/png;base64,AAAA', expect.stringMatching(/[\\/]assets[\\/]image\.png$/))
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
      content: 'message.imageSavedSuccessfully',
      duration: 3,
      key: 'img-loading-key',
    }))
    expect(send).not.toHaveBeenCalled()
  })

  it('旧三参 save 调用方式必须不再允许', async () => {
    const { default: imgUtil } = await import('./imgUtil.js')

    await expect(imgUtil.save(
      { win: { id: 1 } },
      {
        mode: 'local',
        name: 'image.png',
        base64: 'data:image/png;base64,AAAA',
      },
      {
        imgLocal: '4',
        imgNetwork: '4',
        imgRelativePath: 'assets',
      },
    )).rejects.toThrow()
  })
})
