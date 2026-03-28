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
