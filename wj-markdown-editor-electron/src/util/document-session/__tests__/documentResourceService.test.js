import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convertResourceUrl } from '../../../../../wj-markdown-editor-web/src/util/resourceUrlUtil.js'
import { createBoundFileSession, createDraftSession } from '../documentSessionFactory.js'
import { createDocumentSessionStore } from '../documentSessionStore.js'

// 被测源码统一用平台相关的 `node:path` 解析资源路径，
// 因此测试里的文档路径与资源路径必须按当前平台构造：
// Windows 上 `path.resolve('/docs')` 得到 `<当前盘符>:\docs`，Linux / macOS 上得到 `/docs`。
// 如果直接写死 Windows 路径字面量，`path.isAbsolute` / `path.dirname` / `path.resolve`
// 在 Linux 上会给出完全不同的结果，导致断言与被测代码的真实行为对不上。
const DOC_ROOT = path.resolve('/docs')
const DOCS_SUBDIR = path.join(DOC_ROOT, 'docs')
const DOC_PATH = path.join(DOC_ROOT, 'note.md')
const OTHER_DOC_PATH = path.join(DOC_ROOT, 'other.md')
const ASSETS_DIR = path.join(DOC_ROOT, 'assets')
const ASSET_PATH = path.join(ASSETS_DIR, 'demo.png')
const MISSING_ASSET_PATH = path.join(ASSETS_DIR, 'missing.png')
const INDEX_HTML_PATH = path.join(DOCS_SUBDIR, 'index.html')
// query / hash 后缀不参与 path 归一，直接由平台无关的路径常量拼接。
const INDEX_HTML_WITH_QUERY_PATH = `${INDEX_HTML_PATH}?tab=a`
const INDEX_HTML_WITH_HASH_PATH = `${INDEX_HTML_PATH}#guide`
const HASH_LITERAL_FILE_PATH = path.join(DOCS_SUBDIR, 'a#b.md')
const ENCODED_QUESTION_FILE_PATH = path.join(DOCS_SUBDIR, 'demo?guide.md')
// 另存为的目标路径同样不能写死盘符，否则在 Linux 上会变成 cwd 下的相对结果。
const SAVED_FROM_THROW_PATH = path.resolve('/exports/saved-from-throw.png')
const SAVED_FROM_EMPTY_PATH = path.resolve('/exports/saved-from-empty.png')
const PICKED_PNG_PATH = path.resolve('/exports/picked.png')
const PICKED_AVIF_PATH = path.resolve('/exports/picked.avif')
const PICKED_JPG_PATH = path.resolve('/exports/picked.jpg')

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
  const webContents = {
    isDestroyed: vi.fn(() => false),
    copyImageAt: vi.fn(),
  }
  const window = {
    isDestroyed: vi.fn(() => false),
    webContents,
  }
  const resolveWindowById = vi.fn(() => window)
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
    resolveWindowById,
  })

  return {
    clipboardApi,
    dialogApi,
    fetchImpl,
    fsModule,
    nativeImageApi,
    resolveWindowById,
    service,
    showItemInFolder,
    store,
    webContents,
    window,
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
      path: DOC_PATH,
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
      path: ASSET_PATH,
      text: ASSET_PATH,
    })
  })

  it('document.resource.copy-absolute-path 在完整路径不存在但 fallback 可用时，应返回 fallback 对应的真实文件路径', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-fallback-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004011,
    })
    const windowId = bindSession(store, session)
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === INDEX_HTML_PATH
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
      path: INDEX_HTML_PATH,
      text: INDEX_HTML_PATH,
    })
    expect(pathExists).toHaveBeenNthCalledWith(1, INDEX_HTML_WITH_QUERY_PATH)
    expect(pathExists).toHaveBeenNthCalledWith(2, INDEX_HTML_PATH)
    expect(stat).toHaveBeenCalledWith(INDEX_HTML_PATH)
  })

  it('document.resource.copy-absolute-path 在字面量 hash 文件名存在时，应返回完整文件路径而不是 fallback', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-literal-hash-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004012,
    })
    const windowId = bindSession(store, session)
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === HASH_LITERAL_FILE_PATH
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
      path: HASH_LITERAL_FILE_PATH,
      text: HASH_LITERAL_FILE_PATH,
    })
    expect(pathExists).toHaveBeenCalledWith(HASH_LITERAL_FILE_PATH)
    expect(stat).toHaveBeenCalledWith(HASH_LITERAL_FILE_PATH)
  })

  it('document.resource.copy-absolute-path 在字面量编码问号文件名存在时，应返回完整文件路径', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-literal-encoded-question-session',
      path: DOC_PATH,
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
      path: ENCODED_QUESTION_FILE_PATH,
      text: ENCODED_QUESTION_FILE_PATH,
    })
  })

  it('document.resource.copy-absolute-path 在本地文件不存在时仍应返回路径文本', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-missing-session',
      path: DOC_PATH,
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
      path: MISSING_ASSET_PATH,
      text: MISSING_ASSET_PATH,
    })
    expect(stat).not.toHaveBeenCalled()
  })

  it('document.resource.copy-absolute-path 在磁盘探测异常时，仍应回退返回完整路径文本', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-absolute-path-no-probe-session',
      path: DOC_PATH,
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
      path: INDEX_HTML_WITH_HASH_PATH,
      text: INDEX_HTML_WITH_HASH_PATH,
    })
    expect(pathExists).toHaveBeenCalledWith(INDEX_HTML_WITH_HASH_PATH)
  })

  it('document.resource.copy-link 在 remote 资源上成功时应该返回 text 字段', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-link-success-session',
      path: DOC_PATH,
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
      path: DOC_PATH,
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
      messageKey: 'message.previewAssetSourceTypeMismatch',
      text: null,
    })
    expect(pathExists).not.toHaveBeenCalled()
  })

  it.each([
    ['openInFolder', 'opened', 'showItemInFolder'],
    ['deleteLocal', 'removed', 'remove'],
    ['getInfo', 'exists', 'pathExists'],
  ])('document.resource.%s 在 resourceUrl 明确是远程地址时，不得回退到 rawPath 执行本地动作', async (methodName, falseFlagKey, sideEffectKey) => {
    const serviceContext = await createServiceContext()
    const { service, store } = serviceContext
    const session = createBoundFileSession({
      sessionId: `${methodName}-remote-resource-url-session`,
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004012,
    })
    const windowId = bindSession(store, session)

    const result = await service[methodName]({
      windowId,
      payload: {
        resourceUrl: 'https://example.com/remote.png',
        rawPath: './assets/victim.txt',
      },
    })

    expect(result).toMatchObject({
      ok: false,
      reason: 'source-type-mismatch',
      [falseFlagKey]: false,
    })
    expect(pathExists).not.toHaveBeenCalled()
    expect(stat).not.toHaveBeenCalled()
    expect(sideEffectKey === 'showItemInFolder'
      ? serviceContext.showItemInFolder
      : ({
          remove,
          pathExists,
        })[sideEffectKey]).not.toHaveBeenCalled()
  })

  it('document.resource.copy-image 对本地 PNG 图片应改走 webContents.copyImageAt，且不再读取文件或写原生剪贴板', async () => {
    const { clipboardApi, fetchImpl, nativeImageApi, service, store, webContents } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-local-png-success-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004013,
    })
    const windowId = bindSession(store, session)

    const result = await service.copyImage({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
        copyTarget: {
          x: 180,
          y: 260,
        },
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'copied',
    })
    expect(webContents.copyImageAt).toHaveBeenCalledWith(180, 260)
    expect(pathExists).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(nativeImageApi.createFromBuffer).not.toHaveBeenCalled()
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it.each([
    ['./assets/foo?bar.png', path.join(ASSETS_DIR, 'foo?bar.png')],
    ['./assets/foo#bar.jpg', path.join(ASSETS_DIR, 'foo#bar.jpg')],
  ])('document.resource.copy-image 对文件名合法包含 query/hash 字符的本地图片 %s，应直接走 copyImageAt 而不是格式白名单', async (rawPath) => {
    const { clipboardApi, fetchImpl, nativeImageApi, service, store, webContents } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: `copy-image-local-special-char-${rawPath}-session`,
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004013,
    })
    const windowId = bindSession(store, session)

    const result = await service.copyImage({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: rawPath,
        rawPath,
        resourceUrl: convertResourceUrl(rawPath),
        copyTarget: {
          x: 181,
          y: 261,
        },
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'copied',
    })
    expect(webContents.copyImageAt).toHaveBeenCalledWith(181, 261)
    expect(pathExists).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(nativeImageApi.createFromBuffer).not.toHaveBeenCalled()
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.copy-image 对远程 WebP 图片应直接走 webContents.copyImageAt，且不再发起下载', async () => {
    const { clipboardApi, fetchImpl, nativeImageApi, service, store, webContents } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-remote-webp-copy-image-at-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004013,
    })
    const windowId = bindSession(store, session)

    const result = await service.copyImage({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/demo.webp',
        rawPath: 'https://example.com/demo.webp',
        resourceUrl: 'https://example.com/demo.webp',
        copyTarget: {
          x: 182,
          y: 262,
        },
      },
    })

    expect(result).toEqual({
      ok: true,
      reason: 'copied',
    })
    expect(webContents.copyImageAt).toHaveBeenCalledWith(182, 262)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(nativeImageApi.createFromBuffer).not.toHaveBeenCalled()
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.copy-image 在 copyTarget 缺失时应返回 invalid-copy-image-target', async () => {
    const { clipboardApi, fetchImpl, nativeImageApi, service, store, webContents } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-invalid-target-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004013,
    })
    const windowId = bindSession(store, session)

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
      reason: 'invalid-copy-image-target',
      messageKey: 'message.previewAssetInvalidCopyImageTarget',
    })
    expect(webContents.copyImageAt).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(nativeImageApi.createFromBuffer).not.toHaveBeenCalled()
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 在用户取消时必须返回取消态', async () => {
    const { dialogApi, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-cancel-session',
      path: DOC_PATH,
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
    expect(readFile).not.toHaveBeenCalled()
    expect(fsModule.copyFile).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 对 URL 无扩展名的远程图片，用户取消时允许 HEAD probe，但仍不得进入真实下载内容阶段', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-cancel-before-fetch-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004034,
    })
    const windowId = bindSession(store, session)
    const headArrayBuffer = vi.fn(async () => Buffer.from('probe-body-should-not-read'))
    const headText = vi.fn(async () => 'probe-body-should-not-read')
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name?.toLowerCase() === 'content-type' ? 'image/webp' : null
        },
      },
      get body() {
        throw new Error('probe 阶段不应访问响应体')
      },
      arrayBuffer: headArrayBuffer,
      text: headText,
    })
    dialogApi.showSaveDialogSync.mockReturnValue(undefined)

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo',
        rawPath: 'https://example.com/assets/demo',
        resourceUrl: 'https://example.com/assets/demo',
      },
    })

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      reason: 'cancelled',
    })
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'demo.webp',
    }))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/assets/demo', expect.objectContaining({
      method: 'HEAD',
    }))
    expect(headArrayBuffer).not.toHaveBeenCalled()
    expect(headText).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 本地图片另存为时应直接复制文件，不依赖 nativeImage 解码结果', async () => {
    const { dialogApi, fsModule, nativeImageApi, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-ignore-native-image-throw-session',
      path: DOC_PATH,
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
    dialogApi.showSaveDialogSync.mockReturnValue(SAVED_FROM_THROW_PATH)

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
      path: SAVED_FROM_THROW_PATH,
      targetPath: SAVED_FROM_THROW_PATH,
      messageKey: 'message.saveAsSuccessfully',
    })
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'demo.png',
    }))
    expect(fsModule.copyFile).toHaveBeenCalledWith(ASSET_PATH, SAVED_FROM_THROW_PATH)
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 本地图片另存为在目标路径与源路径不同时时应走 copyFile', async () => {
    const { dialogApi, fsModule, nativeImageApi, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-ignore-native-image-empty-session',
      path: DOC_PATH,
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
    dialogApi.showSaveDialogSync.mockReturnValue(SAVED_FROM_EMPTY_PATH)

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
      path: SAVED_FROM_EMPTY_PATH,
      targetPath: SAVED_FROM_EMPTY_PATH,
      messageKey: 'message.saveAsSuccessfully',
    })
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'demo.png',
    }))
    expect(fsModule.copyFile).toHaveBeenCalledWith(ASSET_PATH, SAVED_FROM_EMPTY_PATH)
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 对远程图片应先按 URL 推导默认文件名，再在选完路径后下载', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-file-name-session',
      path: DOC_PATH,
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
    dialogApi.showSaveDialogSync.mockReturnValue(PICKED_PNG_PATH)

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
      defaultPath: 'demo.jpg',
    }))
    expect(fsModule.writeFile).toHaveBeenCalledWith(PICKED_PNG_PATH, expect.any(Buffer))
    expect(result).toEqual({
      ok: true,
      reason: 'saved',
      path: PICKED_PNG_PATH,
      targetPath: PICKED_PNG_PATH,
      messageKey: 'message.saveAsSuccessfully',
    })
  })

  it('document.resource.save-as 对可靠 URL 的远程图片在用户选路径前不应额外做 HEAD probe', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-reliable-url-no-probe-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004021,
    })
    const windowId = bindSession(store, session)
    dialogApi.showSaveDialogSync.mockReturnValue(undefined)

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo.jpg?download=1',
        rawPath: 'https://example.com/assets/demo.jpg?download=1',
        resourceUrl: 'https://example.com/assets/demo.jpg?download=1',
      },
    })

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      reason: 'cancelled',
    })
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'demo.jpg',
    }))
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as URL 无扩展名的远程图片应通过 HEAD 的 Content-Type 补默认扩展名', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-unmapped-extension-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004021,
    })
    const windowId = bindSession(store, session)
    const headArrayBuffer = vi.fn(async () => Buffer.from('probe-body-should-not-read'))
    const headText = vi.fn(async () => 'probe-body-should-not-read')
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name?.toLowerCase() === 'content-type' ? 'image/avif' : null
        },
      },
      get body() {
        throw new Error('probe 阶段不应访问响应体')
      },
      arrayBuffer: headArrayBuffer,
      text: headText,
    })
    dialogApi.showSaveDialogSync.mockReturnValue(undefined)

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo',
        rawPath: 'https://example.com/assets/demo',
        resourceUrl: 'https://example.com/assets/demo',
      },
    })

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      reason: 'cancelled',
    })
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'demo.avif',
    }))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/assets/demo', expect.objectContaining({
      method: 'HEAD',
    }))
    expect(headArrayBuffer).not.toHaveBeenCalled()
    expect(headText).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 在 HEAD probe 超时后应在短超时预算内静默回退到 demo.png', async () => {
    vi.useFakeTimers()
    try {
      const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
      const session = createBoundFileSession({
        sessionId: 'save-as-remote-head-timeout-session',
        path: DOC_PATH,
        content: '# 文档',
        stat: null,
        now: 1700000004035,
      })
      const windowId = bindSession(store, session)
      fetchImpl.mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          }, { once: true })
        })
      })
      dialogApi.showSaveDialogSync.mockReturnValue(undefined)

      const resultPromise = service.saveAs({
        windowId,
        payload: {
          sourceType: 'remote',
          rawSrc: 'https://example.com/assets/demo',
          rawPath: 'https://example.com/assets/demo',
          resourceUrl: 'https://example.com/assets/demo',
        },
      })
      let settled = false
      resultPromise.finally(() => {
        settled = true
      })

      await vi.advanceTimersByTimeAsync(700)

      expect(settled).toBe(false)
      expect(dialogApi.showSaveDialogSync).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(800)

      await expect(resultPromise).resolves.toEqual({
        ok: false,
        cancelled: true,
        reason: 'cancelled',
      })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/assets/demo', expect.objectContaining({
        method: 'HEAD',
        signal: expect.any(AbortSignal),
      }))
      expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
        defaultPath: 'demo.png',
      }))
      expect(fsModule.writeFile).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('document.resource.save-as 的 HEAD probe 应使用独立短超时预算，而不是沿用长下载超时', async () => {
    vi.useFakeTimers()
    try {
      const { dialogApi, fetchImpl, service, store } = await createServiceContext()
      const session = createBoundFileSession({
        sessionId: 'save-as-remote-head-short-timeout-session',
        path: DOC_PATH,
        content: '# 文档',
        stat: null,
        now: 1700000004036,
      })
      const windowId = bindSession(store, session)
      fetchImpl.mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          }, { once: true })
        })
      })
      dialogApi.showSaveDialogSync.mockReturnValue(undefined)

      const resultPromise = service.saveAs({
        windowId,
        payload: {
          sourceType: 'remote',
          rawSrc: 'https://example.com/assets/demo',
          rawPath: 'https://example.com/assets/demo',
          resourceUrl: 'https://example.com/assets/demo',
        },
      })

      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(dialogApi.showSaveDialogSync).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(700)

      expect(dialogApi.showSaveDialogSync).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(800)

      await expect(resultPromise).resolves.toEqual({
        ok: false,
        cancelled: true,
        reason: 'cancelled',
      })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/assets/demo', expect.objectContaining({
        method: 'HEAD',
        signal: expect.any(AbortSignal),
      }))
      expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
        defaultPath: 'demo.png',
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('document.resource.save-as 对 URL 无扩展名的远程图片应先 HEAD 修正默认名，再在选完路径后发起真实 GET 下载', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-probe-then-get-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004036,
    })
    const windowId = bindSession(store, session)
    const callSequence = []
    const headArrayBuffer = vi.fn(async () => Buffer.from('probe-body-should-not-read'))
    const headText = vi.fn(async () => 'probe-body-should-not-read')
    const getArrayBuffer = vi.fn(async () => Buffer.from('remote-avif'))
    fetchImpl.mockImplementation(async (_url, options) => {
      const requestMethod = options?.method || 'GET'
      callSequence.push(requestMethod)

      if (requestMethod === 'HEAD') {
        return {
          ok: true,
          status: 200,
          headers: {
            get(name) {
              return name?.toLowerCase() === 'content-type' ? 'image/avif' : null
            },
          },
          get body() {
            throw new Error('HEAD probe 阶段不应访问响应体')
          },
          arrayBuffer: headArrayBuffer,
          text: headText,
        }
      }

      return {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            return name?.toLowerCase() === 'content-type' ? 'image/avif' : null
          },
        },
        arrayBuffer: getArrayBuffer,
      }
    })
    dialogApi.showSaveDialogSync.mockImplementation(({ defaultPath }) => {
      callSequence.push(`dialog:${defaultPath}`)
      return PICKED_AVIF_PATH
    })

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo',
        rawPath: 'https://example.com/assets/demo',
        resourceUrl: 'https://example.com/assets/demo',
      },
    })

    expect(callSequence).toEqual([
      'HEAD',
      'dialog:demo.avif',
      'GET',
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/assets/demo', expect.objectContaining({
      method: 'HEAD',
    }))
    expect(headArrayBuffer).not.toHaveBeenCalled()
    expect(headText).not.toHaveBeenCalled()
    expect(getArrayBuffer).toHaveBeenCalledTimes(1)
    expect(fsModule.writeFile).toHaveBeenCalledWith(PICKED_AVIF_PATH, expect.any(Buffer))
    expect(result).toEqual({
      ok: true,
      reason: 'saved',
      path: PICKED_AVIF_PATH,
      targetPath: PICKED_AVIF_PATH,
      messageKey: 'message.saveAsSuccessfully',
    })
  })

  it('document.resource.save-as 在 HEAD 返回 405 时，禁止退化成 GET fallback', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-head-405-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004037,
    })
    const windowId = bindSession(store, session)
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 405,
      headers: {
        get() {
          return null
        },
      },
      get body() {
        throw new Error('probe 阶段不应访问响应体')
      },
      arrayBuffer: vi.fn(async () => Buffer.from('probe-body-should-not-read')),
      text: vi.fn(async () => 'probe-body-should-not-read'),
    })
    dialogApi.showSaveDialogSync.mockReturnValue(undefined)

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo',
        rawPath: 'https://example.com/assets/demo',
        resourceUrl: 'https://example.com/assets/demo',
      },
    })

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      reason: 'cancelled',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/assets/demo', expect.objectContaining({
      method: 'HEAD',
    }))
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'demo.png',
    }))
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 的 Content-Disposition filename* 应覆盖 filename', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-content-disposition-filename-star-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004038,
    })
    const windowId = bindSession(store, session)
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          if (name?.toLowerCase() === 'content-disposition') {
            return 'attachment; filename=plain.png; filename*=UTF-8\'\'cover.webp'
          }
          if (name?.toLowerCase() === 'content-type') {
            return 'image/avif'
          }
          return null
        },
      },
      get body() {
        throw new Error('probe 阶段不应访问响应体')
      },
      arrayBuffer: vi.fn(async () => Buffer.from('probe-body-should-not-read')),
      text: vi.fn(async () => 'probe-body-should-not-read'),
    })
    dialogApi.showSaveDialogSync.mockReturnValue(undefined)

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo',
        rawPath: 'https://example.com/assets/demo',
        resourceUrl: 'https://example.com/assets/demo',
      },
    })

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      reason: 'cancelled',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/assets/demo', expect.objectContaining({
      method: 'HEAD',
    }))
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'cover.webp',
    }))
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 在 probe 期间窗口切到其他 session 后，必须返回 stale-document-context 且不再弹保存框', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-probe-stale-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004039,
    })
    const windowId = bindSession(store, session)
    const deferred = createDeferred()
    fetchImpl.mockImplementation(async () => {
      return await deferred.promise
    })
    dialogApi.showSaveDialogSync.mockReturnValue(PICKED_AVIF_PATH)

    const resultPromise = service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo',
        rawPath: 'https://example.com/assets/demo',
        resourceUrl: 'https://example.com/assets/demo',
      },
    })

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const nextSession = createBoundFileSession({
      sessionId: 'save-as-remote-probe-stale-next-session',
      path: OTHER_DOC_PATH,
      content: '# 其他文档',
      stat: null,
      now: 1700000004040,
    })
    store.createSession(nextSession)
    store.bindWindowToSession({
      windowId,
      sessionId: nextSession.sessionId,
    })
    deferred.resolve({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name?.toLowerCase() === 'content-type' ? 'image/avif' : null
        },
      },
      arrayBuffer: vi.fn(async () => Buffer.from('remote-avif')),
    })

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: 'stale-document-context',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/assets/demo', expect.objectContaining({
      method: 'HEAD',
    }))
    expect(dialogApi.showSaveDialogSync).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 的 HEAD probe 阶段不得读取 response.body / arrayBuffer() / text()', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-probe-no-body-read-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004041,
    })
    const windowId = bindSession(store, session)
    const bodyAccess = vi.fn(() => {
      throw new Error('probe 阶段不应访问响应体')
    })
    const headArrayBuffer = vi.fn(async () => Buffer.from('probe-body-should-not-read'))
    const headText = vi.fn(async () => 'probe-body-should-not-read')
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get(name) {
          if (name?.toLowerCase() === 'content-disposition') {
            return 'attachment; filename=plain.png; filename*=UTF-8\'\'cover.avif'
          }
          if (name?.toLowerCase() === 'content-type') {
            return 'image/avif'
          }
          return null
        },
      },
      get body() {
        bodyAccess()
        return null
      },
      arrayBuffer: headArrayBuffer,
      text: headText,
    })
    dialogApi.showSaveDialogSync.mockReturnValue(undefined)

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/assets/demo',
        rawPath: 'https://example.com/assets/demo',
        resourceUrl: 'https://example.com/assets/demo',
      },
    })

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      reason: 'cancelled',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://example.com/assets/demo', expect.objectContaining({
      method: 'HEAD',
    }))
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'cover.avif',
    }))
    expect(bodyAccess).not.toHaveBeenCalled()
    expect(headArrayBuffer).not.toHaveBeenCalled()
    expect(headText).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.open-in-folder 应该从 active session 解析相对资源并成功打开', async () => {
    const { service, showItemInFolder, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'resource-session',
      path: DOC_PATH,
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
      path: ASSET_PATH,
    })
    expect(showItemInFolder).toHaveBeenCalledWith(ASSET_PATH)
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
      path: DOC_PATH,
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
          documentPath: OTHER_DOC_PATH,
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
      path: DOC_PATH,
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
      path: ASSET_PATH,
    })
  })

  it('document.resource.open-in-folder 在本地文件不存在时必须返回 not-found', async () => {
    const { service, showItemInFolder, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'resource-open-missing-session',
      path: DOC_PATH,
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
      path: MISSING_ASSET_PATH,
    })
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('document.resource.open-in-folder 在 resourceUrl 目标不存在但 rawPath 去掉 query 后能定位真实文件时，仍应成功打开', async () => {
    const { service, showItemInFolder, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'query-fallback-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004003,
    })
    const windowId = bindSession(store, session)
    pathExists.mockImplementation(async (targetPath) => {
      return targetPath === INDEX_HTML_PATH
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
      path: INDEX_HTML_PATH,
    })
    expect(showItemInFolder).toHaveBeenCalledWith(INDEX_HTML_PATH)
  })

  it('document.resource.delete-local 删除文件失败时，应标准化为 delete-failed 并保留 Markdown 清理裁决给 renderer', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'delete-failed-session',
      path: DOC_PATH,
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
      path: ASSET_PATH,
    })
  })

  it('document.resource.copy-image 在 resolveWindowById 期间若 session 已切换，必须返回 stale-document-context 且不调用 copyImageAt', async () => {
    const { clipboardApi, resolveWindowById, service, store, webContents, window } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-stale-before-copy-image-at-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004028,
    })
    const windowId = bindSession(store, session)
    resolveWindowById.mockImplementation(() => {
      const nextSession = createBoundFileSession({
        sessionId: 'copy-image-stale-next-session',
        path: OTHER_DOC_PATH,
        content: '# 其他文档',
        stat: null,
        now: 1700000004029,
      })
      store.createSession(nextSession)
      store.bindWindowToSession({
        windowId,
        sessionId: nextSession.sessionId,
      })
      return window
    })

    const result = await service.copyImage({
      windowId,
      payload: {
        sourceType: 'local',
        rawSrc: './assets/demo.png',
        rawPath: './assets/demo.png',
        resourceUrl: convertResourceUrl('./assets/demo.png'),
        copyTarget: {
          x: 180,
          y: 260,
        },
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'stale-document-context',
    })
    expect(webContents.copyImageAt).not.toHaveBeenCalled()
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.copy-image 在窗口已销毁时应返回 host-window-unavailable', async () => {
    const { clipboardApi, fetchImpl, nativeImageApi, service, store, webContents, window } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-host-window-unavailable-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004034,
    })
    const windowId = bindSession(store, session)
    window.isDestroyed.mockReturnValue(true)

    const result = await service.copyImage({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/demo.webp',
        rawPath: 'https://example.com/demo.webp',
        resourceUrl: 'https://example.com/demo.webp',
        copyTarget: {
          x: 183,
          y: 263,
        },
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'host-window-unavailable',
      messageKey: 'message.previewAssetHostWindowUnavailable',
    })
    expect(webContents.copyImageAt).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(nativeImageApi.createFromBuffer).not.toHaveBeenCalled()
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 对远程图片 content-length 超限时，应在选完路径后且读取响应体前直接失败', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-size-header-session',
      path: DOC_PATH,
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
    dialogApi.showSaveDialogSync.mockReturnValue(PICKED_JPG_PATH)

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
      messageKey: 'message.previewAssetRemoteResourceTooLarge',
    })
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(dialogApi.showSaveDialogSync).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'too-large.jpg',
    }))
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.copy-image 在 webContents.copyImageAt 抛错时应返回 copy-image-failed', async () => {
    const { clipboardApi, fetchImpl, nativeImageApi, service, store, webContents } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'copy-image-copy-image-at-throw-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004027,
    })
    const windowId = bindSession(store, session)
    webContents.copyImageAt.mockImplementation(() => {
      throw new Error('copy-image-at failed')
    })

    const result = await service.copyImage({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: 'https://example.com/demo.webp',
        rawPath: 'https://example.com/demo.webp',
        resourceUrl: 'https://example.com/demo.webp',
        copyTarget: {
          x: 184,
          y: 264,
        },
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'copy-image-failed',
      messageKey: 'message.copyFailed',
    })
    expect(webContents.copyImageAt).toHaveBeenCalledWith(184, 264)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(nativeImageApi.createFromBuffer).not.toHaveBeenCalled()
    expect(clipboardApi.writeImage).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 在远程 rawSrc 丢失时必须 fail-closed，不能静默回退到 resourceUrl', async () => {
    const { dialogApi, fetchImpl, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-remote-missing-raw-src-session',
      path: DOC_PATH,
      content: '# 文档',
      stat: null,
      now: 1700000004035,
    })
    const windowId = bindSession(store, session)

    const result = await service.saveAs({
      windowId,
      payload: {
        sourceType: 'remote',
        rawSrc: null,
        rawPath: null,
        resourceUrl: 'https://example.com/fallback-only.png',
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: 'invalid-remote-resource',
      messageKey: 'message.previewAssetRemoteResourceInvalid',
    })
    expect(dialogApi.showSaveDialogSync).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.save-as 在本地文件不存在时必须返回 not-found', async () => {
    const { dialogApi, fsModule, service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'save-as-missing-session',
      path: DOC_PATH,
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
      path: MISSING_ASSET_PATH,
      messageKey: 'message.theFileDoesNotExist',
    })
    expect(dialogApi.showSaveDialogSync).not.toHaveBeenCalled()
    expect(fsModule.copyFile).not.toHaveBeenCalled()
    expect(fsModule.writeFile).not.toHaveBeenCalled()
  })

  it('document.resource.delete-local 在请求上下文已过期时，必须拒绝执行，避免把旧文档资源删到当前 active session 上', async () => {
    const { service, store } = await createServiceContext()
    const session = createBoundFileSession({
      sessionId: 'delete-stale-context-session',
      path: DOC_PATH,
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
          documentPath: OTHER_DOC_PATH,
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
      path: DOC_PATH,
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
      path: OTHER_DOC_PATH,
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
      path: DOC_PATH,
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
        path: OTHER_DOC_PATH,
        content: '# 其他文档',
        stat: null,
        now: 1700000004033,
      })
      store.createSession(nextSession)
      store.bindWindowToSession({
        windowId,
        sessionId: nextSession.sessionId,
      })
      return PICKED_PNG_PATH
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
      path: DOC_PATH,
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

    // createComparableKey 只对盘符路径做小写归一，POSIX 路径原样保留。
    const expectedComparableKey = process.platform === 'win32'
      ? `wj-local-file:${ASSET_PATH.replaceAll('\\', '/').toLowerCase()}`
      : `wj-local-file:${ASSET_PATH}`

    expect(result).toBe(expectedComparableKey)
  })
})
