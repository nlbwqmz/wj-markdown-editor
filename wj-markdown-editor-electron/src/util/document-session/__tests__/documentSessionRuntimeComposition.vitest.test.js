import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createDocumentCommandService,
  createDocumentDirectoryWatchService,
  createDocumentEffectService,
  createDocumentFileManagerService,
  createDocumentResourceService,
  createDocumentSessionStore,
  createSaveCoordinator,
  createWindowSessionBridge,
  fileManagerService,
} = vi.hoisted(() => {
  const fileManagerService = {
    readDirectoryState: vi.fn(async () => ({
      directoryPath: 'D:/docs',
      entryList: [],
    })),
  }

  return {
    createDocumentCommandService: vi.fn(() => ({
      dispatch: vi.fn(() => ({
        session: null,
        snapshot: null,
        effects: [],
      })),
    })),
    createDocumentDirectoryWatchService: vi.fn(() => ({
      ensureWindowDirectory: vi.fn(),
      getWindowDirectoryBinding: vi.fn(),
      getWindowDirectoryReadContext: vi.fn(),
      rebindWindowDirectory: vi.fn(),
      rebindWindowDirectoryFromSession: vi.fn(),
      stopWindowDirectory: vi.fn(),
    })),
    createDocumentEffectService: vi.fn(() => ({
      executeCommand: vi.fn(),
    })),
    createDocumentFileManagerService: vi.fn(() => fileManagerService),
    createDocumentResourceService: vi.fn(() => ({
      openInFolder: vi.fn(),
      copyAbsolutePath: vi.fn(),
      copyLink: vi.fn(),
      copyImage: vi.fn(),
      saveAs: vi.fn(),
      deleteLocal: vi.fn(),
      getInfo: vi.fn(),
      getComparableKey: vi.fn(),
    })),
    createDocumentSessionStore: vi.fn(() => ({
      getSession: vi.fn(() => null),
      getSessionByWindowId: vi.fn(() => null),
    })),
    createSaveCoordinator: vi.fn(() => ({
      consumeCopySaveCompletion: vi.fn(() => null),
    })),
    createWindowSessionBridge: vi.fn(() => ({
      getSessionSnapshot: vi.fn(() => null),
      publishSnapshotChanged: vi.fn(),
      publishMessage: vi.fn(),
      publishRecentListChanged: vi.fn(list => list),
      publishFileManagerDirectoryChanged: vi.fn(),
    })),
    fileManagerService,
  }
})

vi.mock('../documentCommandService.js', () => ({
  createDocumentCommandService,
}))

vi.mock('../documentDirectoryWatchService.js', () => ({
  createDocumentDirectoryWatchService,
}))

vi.mock('../documentEffectService.js', () => ({
  createDocumentEffectService,
}))

vi.mock('../documentFileManagerService.js', () => ({
  createDocumentFileManagerService,
}))

vi.mock('../documentResourceService.js', () => ({
  createDocumentResourceService,
}))

vi.mock('../documentSessionStore.js', () => ({
  createDocumentSessionStore,
}))

vi.mock('../saveCoordinator.js', () => ({
  createSaveCoordinator,
}))

vi.mock('../windowSessionBridge.js', () => ({
  createWindowSessionBridge,
}))

describe('documentSessionRuntimeComposition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fileManagerService.readDirectoryState.mockResolvedValue({
      directoryPath: 'D:/docs',
      entryList: [],
    })
  })

  it('directoryWatchService 的 readDirectoryState 回调必须透传 includeModifiedTime 给 fileManagerService', async () => {
    const { createDocumentSessionRuntimeComposition } = await import('../documentSessionRuntimeComposition.js')

    createDocumentSessionRuntimeComposition({
      registry: {
        getWindowById: vi.fn(() => null),
        getAllWindows: vi.fn(() => []),
      },
      getConfig: vi.fn(() => ({
        language: 'zh-CN',
      })),
      recentStore: {
        add: vi.fn(),
        clear: vi.fn(),
        remove: vi.fn(),
        get: vi.fn(() => []),
        setMax: vi.fn(),
      },
      sendToRenderer: vi.fn(),
      showItemInFolder: vi.fn(),
      dialogApi: {
        showOpenDialogSync: vi.fn(),
        showSaveDialogSync: vi.fn(),
      },
      fetchImpl: vi.fn(),
    })

    const directoryWatchServiceOptions = createDocumentDirectoryWatchService.mock.calls[0]?.[0]
    expect(directoryWatchServiceOptions).toEqual(expect.objectContaining({
      readDirectoryState: expect.any(Function),
    }))

    await directoryWatchServiceOptions.readDirectoryState({
      directoryPath: 'D:/docs',
      activePath: 'D:/docs/current.md',
      includeModifiedTime: true,
    })

    expect(fileManagerService.readDirectoryState).toHaveBeenCalledWith({
      directoryPath: 'D:/docs',
      activePath: 'D:/docs/current.md',
      includeModifiedTime: true,
    })
  })
})
