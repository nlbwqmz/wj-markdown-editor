import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appGetVersion,
  autoUpdaterCheckForUpdates,
  autoUpdaterSetFeedURL,
  axiosGet,
  scheduleJob,
  send,
} = vi.hoisted(() => ({
  appGetVersion: vi.fn(() => '2.15.0'),
  autoUpdaterCheckForUpdates: vi.fn(),
  autoUpdaterSetFeedURL: vi.fn(),
  axiosGet: vi.fn(),
  scheduleJob: vi.fn(),
  send: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    get: axiosGet,
  },
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: appGetVersion,
  },
}))

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {
      setFeedURL: autoUpdaterSetFeedURL,
      checkForUpdates: autoUpdaterCheckForUpdates,
      on: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(),
    },
    CancellationToken: vi.fn(),
  },
}))

vi.mock('node-schedule', () => ({
  default: {
    scheduleJob,
  },
}))

vi.mock('./channel/sendUtil.js', () => ({
  default: {
    send,
  },
}))

describe('updateUtil', () => {
  beforeEach(() => {
    vi.resetModules()
    appGetVersion.mockReset()
    autoUpdaterCheckForUpdates.mockReset()
    autoUpdaterSetFeedURL.mockReset()
    axiosGet.mockReset()
    scheduleJob.mockReset()
    send.mockReset()
    appGetVersion.mockReturnValue('2.15.0')
  })

  it('检测到新版本时，必须按窗口顺序广播 has-new-version=true', async () => {
    const { default: updateUtil } = await import('./updateUtil.js')
    const firstWin = { id: 1 }
    const secondWin = { id: 2 }

    axiosGet.mockResolvedValueOnce({
      data: {
        tag_name: 'v2.16.0',
      },
    })
    autoUpdaterCheckForUpdates.mockResolvedValueOnce({
      updateInfo: {
        version: '2.16.0',
      },
    })

    const result = await updateUtil.checkUpdate([
      firstWin,
      secondWin,
    ])

    expect(result).toEqual({
      finish: true,
      success: true,
      version: '2.16.0',
    })
    expect(autoUpdaterSetFeedURL).toHaveBeenCalledWith('https://github.com/nlbwqmz/wj-markdown-editor/releases/download/v2.16.0')
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenNthCalledWith(1, firstWin, { event: 'has-new-version', data: true })
    expect(send).toHaveBeenNthCalledWith(2, secondWin, { event: 'has-new-version', data: true })
  })
})
