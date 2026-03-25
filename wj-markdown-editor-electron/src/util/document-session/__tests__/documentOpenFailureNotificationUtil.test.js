import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDocumentOpenFailureNotificationPublisher,
  getDocumentOpenFailureNotificationContent,
} from '../documentOpenFailureNotificationUtil.js'

describe('documentOpenFailureNotificationUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('必须根据当前语言生成包含文件名和路径的打开失败通知文案', () => {
    expect(getDocumentOpenFailureNotificationContent({
      documentPath: 'D:/docs/locked.md',
      language: 'zh-CN',
    })).toEqual({
      title: '打开 Markdown 文件失败 - locked.md',
      body: '无法读取该 Markdown 文件，请检查文件权限、占用状态或磁盘连接。\n路径：D:/docs/locked.md',
    })
    expect(getDocumentOpenFailureNotificationContent({
      documentPath: 'D:/docs/locked.md',
      language: 'en-US',
    })).toEqual({
      title: 'Failed to open Markdown file - locked.md',
      body: 'Unable to read this Markdown file. Please check file permissions, file locks, or disk availability.\nPath: D:/docs/locked.md',
    })
  })

  it('系统通知可用时，必须优先发送通知并在点击后聚焦目标窗口', () => {
    const show = vi.fn()
    const on = vi.fn()
    const targetWindow = {
      show: vi.fn(),
      focus: vi.fn(),
    }
    const publisher = createDocumentOpenFailureNotificationPublisher({
      getConfig: () => ({
        language: 'zh-CN',
      }),
      notificationApi: {
        isSupported: vi.fn(() => true),
      },
      createSystemNotification: vi.fn(() => ({
        on,
        show,
      })),
      resolveWindowById: vi.fn(windowId => (windowId === 11 ? targetWindow : null)),
      listWindows: vi.fn(() => []),
      dialogApi: {
        showErrorBox: vi.fn(),
      },
    })

    publisher({
      windowId: 11,
      path: 'D:/docs/locked.md',
    })

    expect(show).toHaveBeenCalledTimes(1)
    expect(on).toHaveBeenCalledWith('click', expect.any(Function))

    const clickHandler = on.mock.calls[0][1]
    clickHandler()

    expect(targetWindow.show).toHaveBeenCalledTimes(1)
    expect(targetWindow.focus).toHaveBeenCalledTimes(1)
  })

  it('系统通知不可用时，必须回退到原生错误框，避免启动打开和二开实例静默失败', () => {
    const dialogApi = {
      showErrorBox: vi.fn(),
    }
    const publisher = createDocumentOpenFailureNotificationPublisher({
      getConfig: () => ({
        language: 'en-US',
      }),
      notificationApi: {
        isSupported: vi.fn(() => false),
      },
      createSystemNotification: vi.fn(),
      resolveWindowById: vi.fn(() => null),
      listWindows: vi.fn(() => []),
      dialogApi,
    })

    publisher({
      windowId: null,
      path: 'D:/docs/locked.md',
    })

    expect(dialogApi.showErrorBox).toHaveBeenCalledWith(
      'Failed to open Markdown file - locked.md',
      'Unable to read this Markdown file. Please check file permissions, file locks, or disk availability.\nPath: D:/docs/locked.md',
    )
  })
})
