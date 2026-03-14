import { beforeEach, describe, expect, it, vi } from 'vitest'
import { convertResourceUrl } from '../../../../../wj-markdown-editor-web/src/util/resourceUrlUtil.js'
import { createBoundFileSession, createDraftSession } from '../documentSessionFactory.js'
import { createDocumentSessionStore } from '../documentSessionStore.js'

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

async function createServiceContext() {
  const { createDocumentResourceService } = await import('../documentResourceService.js')
  const { default: resourceFileUtil } = await import('../../resourceFileUtil.js')
  const store = createDocumentSessionStore()
  const showItemInFolder = vi.fn()
  const service = createDocumentResourceService({
    store,
    resourceUtil: resourceFileUtil,
    showItemInFolder,
  })

  return {
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
    pathExists.mockReset()
    pathExistsSync.mockReset()
    remove.mockReset()
    stat.mockReset()
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
