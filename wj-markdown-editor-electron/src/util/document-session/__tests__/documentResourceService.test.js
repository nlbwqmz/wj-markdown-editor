import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convertResourceUrl } from '../../../../../wj-markdown-editor-web/src/util/resourceUrlUtil.js'
import { createBoundFileSession, createDraftSession } from '../documentSessionFactory.js'
import { createDocumentSessionStore } from '../documentSessionStore.js'

const {
  copyFile,
  pathExists,
  pathExistsSync,
  readFile,
  remove,
  stat,
  writeFile,
} = vi.hoisted(() => {
  return {
    copyFile: vi.fn(),
    pathExists: vi.fn(),
    pathExistsSync: vi.fn(),
    readFile: vi.fn(),
    remove: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
  }
})

vi.mock('fs-extra', () => {
  return {
    default: {
      copyFile,
      pathExists,
      pathExistsSync,
      readFile,
      remove,
      stat,
      writeFile,
    },
  }
})

async function createServiceContext() {
  const { createDocumentResourceService } = await import('../documentResourceService.js')
  const store = createDocumentSessionStore()
  const showItemInFolder = vi.fn()
  const dialogApi = {
    showSaveDialogSync: vi.fn(),
  }
  const clipboardApi = {
    writeImage: vi.fn(),
  }
  const nativeImageApi = {
    createFromBuffer: vi.fn(() => ({
      isEmpty: () => false,
    })),
  }
  const fetchImpl = vi.fn()
  const fsModule = {
    copyFile,
    readFile,
    writeFile,
  }
  const service = createDocumentResourceService({
    store,
    showItemInFolder,
    dialogApi,
    clipboardApi,
    nativeImageApi,
    fetchImpl,
    fsModule,
  })

  return {
    clipboardApi,
    dialogApi,
    fetchImpl,
    fsModule,
    nativeImageApi,
    service,
    showItemInFolder,
    store,
  }
}

function bindSession(store, session, windowId = 1001) {
  store.createSession(session)
  store.bindWindowToSession({
    windowId,
    sessionId: session.sessionId,
  })
  return windowId
}

function createDeferred() {
  let resolve
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve,
  }
}

describe('documentResourceService', () => {
  beforeEach(() => {
    copyFile.mockReset()
    pathExists.mockReset()
    pathExistsSync.mockReset()
    readFile.mockReset()
    remove.mockReset()
    stat.mockReset()
    writeFile.mockReset()
  })

  it('document.resource.copy-absolute-path 应该返回本地资源的绝对路径文本', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004010,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await service.copyAbsolutePath({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'copied',
      path: 'D:\\docs\\assets\\demo.png',
      text: 'D:\\docs\\assets\\demo.png',
    })
  })

  it('document.resource.copy-absolute-path 在完整路径不存在但 fallback 可用时，应返回 fallback 对应的真实文件路径', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-fallback-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004011,
    })
    const windowId = bindSession(store, session)
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === 'D:\\docs\\docs\\index.html'
    })
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await service.copyAbsolutePath({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './docs/index.html?tab=a',
        rawPath: './docs/index.html?tab=a',
        resourceUrl: convertResourceUrl('./docs/index.html?tab=a'),
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'copied',
      path: 'D:\\docs\\docs\\index.html',
      text: 'D:\\docs\\docs\\index.html',
    })
    expect(pathExists).toHaveBeenNthCalledWith(1, 'D:\\docs\\docs\\index.html?tab=a')
    expect(pathExists).toHaveBeenNthCalledWith(2, 'D:\\docs\\docs\\index.html')
    expect(stat).toHaveBeenCalledWith('D:\\docs\\docs\\index.html')
  })

  it('document.resource.copy-absolute-path 在字面量 hash 文件名存在时，应返回完整文件路径而不是 fallback', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-literal-hash-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004012,
    })
    const windowId = bindSession(store, session)
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === 'D:\\docs\\docs\\a#b.md'
    })
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await service.copyAbsolutePath({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './docs/a#b.md',
        rawPath: './docs/a#b.md',
        resourceUrl: convertResourceUrl('./docs/a#b.md'),
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'copied',
      path: 'D:\\docs\\docs\\a#b.md',
      text: 'D:\\docs\\docs\\a#b.md',
    })
    expect(pathExists).toHaveBeenCalledWith('D:\\docs\\docs\\a#b.md')
    expect(stat).toHaveBeenCalledWith('D:\\docs\\docs\\a#b.md')
  })

  it('document.resource.copy-absolute-path 在字面量编码问号文件名存在时，应返回完整文件路径', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-literal-encoded-question-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004013,
    })
    const windowId = bindSession(store, session)

    const result = await service.copyAbsolutePath({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './docs/demo%3Fguide.md',
        rawPath: './docs/demo%3Fguide.md',
        resourceUrl: convertResourceUrl('./docs/demo%3Fguide.md'),
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'copied',
      path: 'D:\\docs\\docs\\demo?guide.md',
      text: 'D:\\docs\\docs\\demo?guide.md',
    })
  })

  it('document.resource.copy-absolute-path 在本地文件不存在时仍应返回路径文本', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-missing-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004011,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(false)

    const result = await service.copyAbsolutePath({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/missing.png',
        rawPath: './assets/missing.png',
        resourceUrl: convertResourceUrl('./assets/missing.png'),
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'copied',
      path: 'D:\\docs\\assets\\missing.png',
      text: 'D:\\docs\\assets\\missing.png',
    })
    expect(stat).not.toHaveBeenCalled()
  })

  it('document.resource.copy-absolute-path 在磁盘探测异常时，仍应回退返回完整路径文本', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-no-probe-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004021,
    })
    const windowId = bindSession(store, session)
    pathExists.mockRejectedValue(new Error('disk probe failed'))

    const result = await service.copyAbsolutePath({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './docs/index.html#guide',
        rawPath: './docs/index.html#guide',
        resourceUrl: convertResourceUrl('./docs/index.html#guide'),
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'copied',
      path: 'D:\\docs\\docs\\index.html#guide',
      text: 'D:\\docs\\docs\\index.html#guide',
    })
    expect(pathExists).toHaveBeenCalledWith('D:\\docs\\docs\\index.html#guide')
  })

  it('document.resource.copy-link 在 remote 资源上成功时应该返回 text 字段', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-link-success-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004018,
    })
    const windowId = bindSession(store, session)

    const result = await service.copyLink({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/demo.png',
        rawPath: 'https://example.com/demo.png',
        resourceUrl: 'https://example.com/demo.png',
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'copied',
      text: 'https://example.com/demo.png',
    })
  })

  it('document.resource.copy-link 只接受 runtime 复判为 remote 的 rawSrc', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-link-source-type-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004012,
    })
    const windowId = bindSession(store, session)

    const result = await service.copyLink({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'source-type-mismatch',
      text: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
  })

  it('document.resource.copy-image 对网络非图片响应必须返回固定失败', async () => {
    const { clipboardApi, fetchImpl, nativeImageApi, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-remote-non-image-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004013,
    })
    const windowId = bindSession(store, session)
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name?.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null
        },
      },
      arrayBuffer: vi.fn(async () => new ArrayBuffer(0)),
    })

    const result = await service.copyImage({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/demo.png',
        rawPath: 'https://example.com/demo.png',
        resourceUrl: 'https://example.com/demo.png',
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'remote-resource-not-image',
    })
    expect(nativeImageApi.createFromBuffer).not.toHaveBeenCalled()
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 在用户取消时必须返回取消态', async () => {
    const { dialogApi, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-cancel-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004014,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    readFile.mockResolvedValue(Buffer.from('png-binary'))
    dialogApi.showSaveDialogSync.mockReturnValue(undefined)

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      reason: 'cancelled',
    })
    expect(fsModule.copyFile).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 在 nativeImage.createFromBuffer 抛错时仍应成功写盘', async () => {
    const { dialogApi, fsModule, nativeImageApi, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-ignore-native-image-throw-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004022,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    readFile.mockResolvedValue(Buffer.from('png-binary'))
    nativeImageApi.createFromBuffer.mockImplementation(() => {
      throw new Error('decode failed')
    })
    dialogApi.showSaveDialogSync.mockReturnValue('D:\\exports\\saved-from-throw.png')

    await expect(service.saveAs({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })).resolves.toEqual({
      ok: true,
      reason: 'saved',
      path: 'D:\\exports\\saved-from-throw.png',
      targetPath: 'D:\\exports\\saved-from-throw.png',
      messageKey: 'message.saveAsSuccessfully',
    })
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'demo.png',
    }))
    expect(fsModule.writeFile).toHaveBeenCalledWith('D:\\exports\\saved-from-throw.png', Buffer.from('png-binary'))
  })

  it('document.resource.save-as 在 nativeImage.createFromBuffer 返回空图时仍应成功写盘', async () => {
    const { dialogApi, fsModule, nativeImageApi, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-ignore-native-image-empty-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004023,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    readFile.mockResolvedValue(Buffer.from('png-binary'))
    nativeImageApi.createFromBuffer.mockReturnValue({
      isEmpty: () => true,
    })
    dialogApi.showSaveDialogSync.mockReturnValue('D:\\exports\\saved-from-empty.png')

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'saved',
      path: 'D:\\exports\\saved-from-empty.png',
      targetPath: 'D:\\exports\\saved-from-empty.png',
      messageKey: 'message.saveAsSuccessfully',
    })
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'demo.png',
    }))
    expect(fsModule.writeFile).toHaveBeenCalledWith('D:\\exports\\saved-from-empty.png', Buffer.from('png-binary'))
  })

  it('document.resource.save-as 对远程图片应按 Content-Type 纠正默认扩展名', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-file-name-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004020,
    })
    const windowId = bindSession(store, session)
    const remoteBuffer = Buffer.from('remote-image')
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name?.toLowerCase() === 'content-type' ? 'image/png' : null
        },
      },
      arrayBuffer: vi.fn(async () => remoteBuffer),
    })
    dialogApi.showSaveDialogSync.mockReturnValue('D:\\exports\\picked.png')

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo.jpg?download=1',
        rawPath: 'https://example.com/assets/demo.jpg?download=1',
        resourceUrl: 'https://example.com/assets/demo.jpg?download=1',
      },
    })

    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'demo.png',
    }))
    expect(fsModule.writeFile).toHaveBeenCalledWith('D:\\exports\\picked.png', expect.any(Buffer))
    expect(result).toEqual({
      ok: true,
      reason: 'saved',
      path: 'D:\\exports\\picked.png',
      targetPath: 'D:\\exports\\picked.png',
      messageKey: 'message.saveAsSuccessfully',
    })
  })

  it('document.resource.save-as 在 URL 无扩展名且 Content-Type 为 image/avif 时，应推导 avif 默认文件名', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-unmapped-extension-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004021,
    })
    const windowId = bindSession(store, session)
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name?.toLowerCase() === 'content-type' ? 'image/avif' : null
        },
      },
      arrayBuffer: vi.fn(async () => Buffer.from('remote-avif')),
    })
    dialogApi.showSaveDialogSync.mockReturnValue('D:\\exports\\picked.avif')

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo?download=1',
        rawPath: 'https://example.com/assets/demo?download=1',
        resourceUrl: 'https://example.com/assets/demo?download=1',
      },
    })

    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'demo.avif',
    }))
    expect(fsModule.writeFile).toHaveBeenCalledWith('D:\\exports\\picked.avif', expect.any(Buffer))
    expect(result).toEqual({
      ok: true,
      reason: 'saved',
      path: 'D:\\exports\\picked.avif',
      targetPath: 'D:\\exports\\picked.avif',
      messageKey: 'message.saveAsSuccessfully',
    })
  })

  it('document.resource.open-in-folder 应该从 active session 解析相对资源并成功打开', async () => {
    const { service, showItemInFolder, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'resource-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004001,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await service.openInFolder({
      windowId,
      payload: {
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    expect(result).toEqual({
      ok: true,
      opened: true,
      reason: 'opened',
      path: 'D:\\docs\\assets\\demo.png',
    })
    expect(showItemInFolder).toHaveBeenCalledWith('D:\\docs\\assets\\demo.png')
  })

  it('document.resource.open-in-folder 在未保存文档中遇到相对资源时，应返回 relative-resource-without-document', async () => {
    const { service, showItemInFolder, store } = await createServiceContext()
    const session = createDraftSession({
      sessionId: 'draft-session',
      now: 1700000004002,
    })
    const windowId = bindSession(store, session)

    const result = await service.openInFolder({
      windowId,
      payload: {
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    expect(result).toEqual({
      ok: false,
      opened: false,
      reason: 'relative-resource-without-document',
      path: null,
    })
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('document.resource.open-in-folder 在请求上下文已过期时，必须拒绝执行，避免把旧文档资源打开到当前 active session 上', async () => {
    const { service, showItemInFolder, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'open-stale-context-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004008,
    })
    const windowId = bindSession(store, session)

    const result = await service.openInFolder({
      windowId,
      payload: {
        resourceUrl: convertResourceUrl('./assets/demo.png'),
        requestContext: {
          sessionId: 'stale-session',
          documentPath: 'D:\\docs\\other.md',
        },
      },
    })

    expect(result).toEqual({
      ok: false,
      opened: false,
      reason: 'stale-document-context',
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('resource.get-info 应该从 active session 解析相对资源并返回文件信息', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'resource-info-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004006,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await service.getInfo({
      windowId,
      payload: {
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

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

  it('document.resource.open-in-folder 在本地文件不存在时必须返回 not-found', async () => {
    const { service, showItemInFolder, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'resource-open-missing-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004015,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(false)

    const result = await service.openInFolder({
      windowId,
      payload: {
        resourceUrl: convertResourceUrl('./assets/missing.png'),
        rawPath: './assets/missing.png',
      },
    })

    expect(result).toEqual({
      ok: true,
      opened: false,
      reason: 'not-found',
      path: 'D:\\docs\\assets\\missing.png',
    })
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('document.resource.open-in-folder 在 resourceUrl 目标不存在但 rawPath 去掉 query 后能定位真实文件时，仍应成功打开', async () => {
    const { service, showItemInFolder, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'query-fallback-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004003,
    })
    const windowId = bindSession(store, session)
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === 'D:\\docs\\docs\\index.html'
    })
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })

    const result = await service.openInFolder({
      windowId,
      payload: {
        resourceUrl: convertResourceUrl('./docs/index.html?tab=current'),
        rawPath: './docs/index.html?tab=current',
      },
    })

    expect(result).toEqual({
      ok: true,
      opened: true,
      reason: 'opened',
      path: 'D:\\docs\\docs\\index.html',
    })
    expect(showItemInFolder).toHaveBeenCalledWith('D:\\docs\\docs\\index.html')
  })

  it('document.resource.delete-local 删除文件失败时，应标准化为 delete-failed 并保留 Markdown 清理裁决给 renderer', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'delete-failed-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004004,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    remove.mockRejectedValue(new Error('remove failed'))

    const result = await service.deleteLocal({
      windowId,
      payload: {
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    expect(result).toEqual({
      ok: false,
      removed: false,
      reason: 'delete-failed',
      path: 'D:\\docs\\assets\\demo.png',
    })
  })

  it('document.resource.copy-image 在本地文件不存在时必须返回 not-found', async () => {
    const { clipboardApi, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-missing-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004016,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(false)

    const result = await service.copyImage({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/missing.png',
        rawPath: './assets/missing.png',
        resourceUrl: convertResourceUrl('./assets/missing.png'),
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'not-found',
      path: 'D:\\docs\\assets\\missing.png',
    })
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.copy-image 在 nativeImage.createFromBuffer 返回空图时必须结构化失败', async () => {
    const { clipboardApi, nativeImageApi, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-empty-native-image-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004024,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    readFile.mockResolvedValue(Buffer.from('png-binary'))
    nativeImageApi.createFromBuffer.mockReturnValue({
      isEmpty: () => true,
    })

    const result = await service.copyImage({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'local-resource-not-image',
      path: 'D:\\docs\\assets\\demo.png',
    })
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.copy-image 在读取期间窗口切到其他 session 后，必须返回 stale-document-context 且不写剪贴板', async () => {
    const { clipboardApi, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-stale-after-read-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004028,
    })
    const windowId = bindSession(store, session)
    const deferred = createDeferred()
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    readFile.mockImplementation(async () => {
      await deferred.promise
      return Buffer.from('png-binary')
    })

    const resultPromise = service.copyImage({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const nextSession = createBoundFileSession({
      sessionId: 'copy-image-stale-next-session',
      path: 'D:\\docs\\other.md',
      content: '# 其他文档',
      stat: null,
      now: 1700000004029,
    })
    store.createSession(nextSession)
    store.bindWindowToSession({
      windowId,
      sessionId: nextSession.sessionId,
    })
    deferred.resolve()

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: 'stale-document-context',
    })
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.copy-image 对远程图片超时应返回结构化失败', async () => {
    vi.useFakeTimers()
    try {
      const { clipboardApi, fetchImpl, nativeImageApi, service, store } = await createServiceContext()
      const session = createBoundFileSession({
        sessionId: 'copy-image-remote-timeout-session',
        path: 'D:\\docs\\note.md',
        content: '# 文档',
        stat: null,
        now: 1700000004025,
      })
      const windowId = bindSession(store, session)
      fetchImpl.mockImplementation((_url, options) => {
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          }, { once: true })
        })
      })

      const resultPromise = service.copyImage({
        windowId,
        payload: {
          sourceType: 'remote',
          rawSrc: 'https://example.com/slow.png',
          rawPath: 'https://example.com/slow.png',
          resourceUrl: 'https://example.com/slow.png',
        },
      })

      await vi.runAllTimersAsync()

      await expect(resultPromise).resolves.toEqual({
        ok: false,
        reason: 'remote-resource-fetch-timeout',
      })
      expect(fetchImpl).toHaveBeenCalledWith('https://example.com/slow.png', expect.objectContaining({
        signal: expect.any(AbortSignal),
      }))
      expect(nativeImageApi.createFromBuffer).not.toHaveBeenCalled()
      expect(clipboardApi.writeImage).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('document.resource.save-as 对远程图片 content-length 超限时应在下载前失败', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-size-header-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004026,
    })
    const windowId = bindSession(store, session)
    const arrayBuffer = vi.fn(async () => Buffer.from('should-not-read'))
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          if (name?.toLowerCase() === 'content-type') {
            return 'image/png'
          }
          if (name?.toLowerCase() === 'content-length') {
            return String(64 * 1024 * 1024)
          }
          return null
        },
      },
      arrayBuffer,
    })

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/too-large.jpg',
        rawPath: 'https://example.com/too-large.jpg',
        resourceUrl: 'https://example.com/too-large.jpg',
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'remote-resource-too-large',
    })
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(dialogApi.showSaveDialogSync).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.copy-image 对缺少 content-length 的远程超限图片应在流式读取超限后立刻失败，且不能走 arrayBuffer 整包读取', async () => {
    const { clipboardApi, fetchImpl, nativeImageApi, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-remote-size-buffer-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004027,
    })
    const windowId = bindSession(store, session)
    const arrayBuffer = vi.fn(async () => {
      throw new Error('不应走到 arrayBuffer')
    })
    const cancel = vi.fn()
    const chunkList = [
      new Uint8Array(10 * 1024 * 1024),
      new Uint8Array(10 * 1024 * 1024),
      new Uint8Array(2 * 1024 * 1024),
    ]
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name?.toLowerCase() === 'content-type' ? 'image/png' : null
        },
      },
      body: {
        getReader() {
          let chunkIndex = 0
          return {
            async read() {
              if (chunkIndex >= chunkList.length) {
                return {
                  done: true,
                  value: undefined,
                }
              }

              const value = chunkList[chunkIndex]
              chunkIndex += 1
              return {
                done: false,
                value,
              }
            },
            cancel,
          }
        },
      },
      arrayBuffer,
    })

    const result = await service.copyImage({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/no-header-too-large.jpg',
        rawPath: 'https://example.com/no-header-too-large.jpg',
        resourceUrl: 'https://example.com/no-header-too-large.jpg',
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'remote-resource-too-large',
    })
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(nativeImageApi.createFromBuffer).not.toHaveBeenCalled()
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 在本地文件不存在时必须返回 not-found', async () => {
    const { dialogApi, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-missing-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004017,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(false)

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/missing.png',
        rawPath: './assets/missing.png',
        resourceUrl: convertResourceUrl('./assets/missing.png'),
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'not-found',
      path: 'D:\\docs\\assets\\missing.png',
    })
    expect(dialogApi.showSaveDialogSync).not.toHaveBeenCalled()
    expect(fsModule.copyFile).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.delete-local 在请求上下文已过期时，必须拒绝执行，避免把旧文档资源删到当前 active session 上', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'delete-stale-context-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004007,
    })
    const windowId = bindSession(store, session)

    const result = await service.deleteLocal({
      windowId,
      payload: {
        resourceUrl: convertResourceUrl('./assets/demo.png'),
        requestContext: {
          sessionId: 'stale-session',
          documentPath: 'D:\\docs\\other.md',
        },
      },
    })

    expect(result).toEqual({
      ok: false,
      removed: false,
      reason: 'stale-document-context',
      path: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 在读取期间窗口切到其他 session 后，必须返回 stale-document-context 且不再弹保存框', async () => {
    const { dialogApi, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-stale-after-read-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004030,
    })
    const windowId = bindSession(store, session)
    const deferred = createDeferred()
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    readFile.mockImplementation(async () => {
      await deferred.promise
      return Buffer.from('png-binary')
    })

    const resultPromise = service.saveAs({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const nextSession = createBoundFileSession({
      sessionId: 'save-as-stale-next-session',
      path: 'D:\\docs\\other.md',
      content: '# 其他文档',
      stat: null,
      now: 1700000004031,
    })
    store.createSession(nextSession)
    store.bindWindowToSession({
      windowId,
      sessionId: nextSession.sessionId,
    })
    deferred.resolve()

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: 'stale-document-context',
    })
    expect(dialogApi.showSaveDialogSync).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 在保存对话框返回后若窗口已切到其他 session，必须返回 stale-document-context 且不写文件', async () => {
    const { dialogApi, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-stale-after-dialog-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004032,
    })
    const windowId = bindSession(store, session)
    pathExists.mockResolvedValue(true)
    stat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    })
    readFile.mockResolvedValue(Buffer.from('png-binary'))
    dialogApi.showSaveDialogSync.mockImplementation(() => {
      const nextSession = createBoundFileSession({
        sessionId: 'save-as-stale-after-dialog-next-session',
        path: 'D:\\docs\\other.md',
        content: '# 其他文档',
        stat: null,
        now: 1700000004033,
      })
      store.createSession(nextSession)
      store.bindWindowToSession({
        windowId,
        sessionId: nextSession.sessionId,
      })
      return 'D:\\exports\\picked.png'
    })

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'stale-document-context',
    })
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('resource.get-comparable-key 对不存在但可解析的本地路径，仍应返回稳定 key', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'comparable-key-session',
      path: 'D:\\docs\\note.md',
      content: '# 文档',
      stat: null,
      now: 1700000004005,
    })
    const windowId = bindSession(store, session)
    pathExistsSync.mockReturnValue(false)

    const result = service.getComparableKey({
      windowId,
      payload: {
        rawPath: './assets/demo.png',
      },
    })

    expect(result).toBe('wj-local-file:d:/docs/assets/demo.png')
  })
})
