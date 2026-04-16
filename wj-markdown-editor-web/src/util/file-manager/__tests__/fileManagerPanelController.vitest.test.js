import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

const { sortFileManagerEntryListMock } = vi.hoisted(() => ({
  sortFileManagerEntryListMock: vi.fn((entryList = []) => [...entryList]),
}))

vi.mock('../fileManagerEntryMetaUtil.js', async () => {
  const actual = await vi.importActual('../fileManagerEntryMetaUtil.js')

  return {
    ...actual,
    sortFileManagerEntryList: sortFileManagerEntryListMock,
  }
})

function createStore() {
  return reactive({
    fileManagerPanelVisible: true,
    documentSessionSnapshot: {
      sessionId: 'session-current',
      displayPath: 'D:/docs/current.md',
      recentMissingPath: null,
      isRecentMissing: false,
      dirty: false,
      resourceContext: {
        documentPath: 'D:/docs/current.md',
      },
    },
    config: {
      language: 'zh-CN',
      fileManagerSort: {
        field: 'type',
        direction: 'asc',
      },
    },
  })
}

async function flushController() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('fileManagerPanelController', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    sortFileManagerEntryListMock.mockClear()
  })

  it('updateFileManagerSortConfig 成功后应只重排一次当前目录缓存，不能额外重复重排', async () => {
    const { createFileManagerPanelController } = await import('../fileManagerPanelController.js')
    const requestDirectoryState = vi.fn().mockResolvedValue({
      directoryPath: 'D:/docs',
      entryList: [
        { name: 'voice.mp3', path: 'D:/docs/voice.mp3', kind: 'file' },
        { name: 'current.md', path: 'D:/docs/current.md', kind: 'file' },
      ],
    })
    const sendCommand = vi.fn().mockResolvedValue({
      ok: true,
    })
    const store = createStore()
    const scope = effectScope()
    let controller = null

    scope.run(() => {
      controller = createFileManagerPanelController({
        store,
        t: value => value,
        sendCommand,
        requestDirectoryState,
        requestOpenDirectory: vi.fn(),
        requestCreateFolder: vi.fn(),
        requestCreateMarkdown: vi.fn(),
        requestPickDirectory: vi.fn(),
        requestDocumentOpenPathByInteraction: vi.fn(),
        openNameInputModal: vi.fn(),
        showWarningMessage: vi.fn(),
        subscribeEvent: vi.fn(),
        unsubscribeEvent: vi.fn(),
      })
    })

    await flushController()
    sortFileManagerEntryListMock.mockClear()

    await controller.updateFileManagerSortConfig({
      field: 'name',
      direction: 'desc',
    })
    await flushController()

    expect(requestDirectoryState).toHaveBeenCalledTimes(1)
    expect(sortFileManagerEntryListMock).toHaveBeenCalledTimes(1)
    expect(store.config.fileManagerSort).toEqual({
      field: 'name',
      direction: 'desc',
    })

    scope.stop()
  })
})
