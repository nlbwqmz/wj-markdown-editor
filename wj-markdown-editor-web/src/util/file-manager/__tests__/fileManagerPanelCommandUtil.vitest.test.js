import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  channelSend: vi.fn(),
}))

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: mocked.channelSend,
  },
}))

describe('fileManagerPanelCommandUtil', () => {
  beforeEach(() => {
    mocked.channelSend.mockReset()
    mocked.channelSend.mockResolvedValue(null)
  })

  it('fileManagerPanelCommandUtil 应复用既有 open-dir-select IPC 作为选择目录能力', async () => {
    const { requestFileManagerPickDirectory } = await import('../fileManagerPanelCommandUtil.js')

    await requestFileManagerPickDirectory()

    expect(mocked.channelSend).toHaveBeenCalledWith(expect.objectContaining({
      event: 'open-dir-select',
    }))
  })

  it('文件管理栏命令包装应把目录状态、打开目录与新建命令映射到统一 IPC 事件', async () => {
    const {
      requestFileManagerCreateFolder,
      requestFileManagerCreateMarkdown,
      requestFileManagerDirectoryState,
      requestFileManagerOpenDirectory,
      requestFileManagerSyncCurrentDirectoryOptions,
    } = await import('../fileManagerPanelCommandUtil.js')

    await requestFileManagerDirectoryState({ directoryPath: 'D:/docs' })
    await requestFileManagerOpenDirectory({ directoryPath: 'D:/docs' })
    await requestFileManagerCreateFolder({ name: 'assets' })
    await requestFileManagerCreateMarkdown({ name: 'draft.md' })
    await requestFileManagerSyncCurrentDirectoryOptions({ includeModifiedTime: false })

    expect(mocked.channelSend.mock.calls.map(([payload]) => payload)).toEqual([
      {
        event: 'file-manager.get-directory-state',
        data: {
          directoryPath: 'D:/docs',
        },
      },
      {
        event: 'file-manager.open-directory',
        data: {
          directoryPath: 'D:/docs',
        },
      },
      {
        event: 'file-manager.create-folder',
        data: {
          name: 'assets',
        },
      },
      {
        event: 'file-manager.create-markdown',
        data: {
          name: 'draft.md',
        },
      },
      {
        event: 'file-manager.sync-current-directory-options',
        data: {
          includeModifiedTime: false,
        },
      },
    ])
  })
})
