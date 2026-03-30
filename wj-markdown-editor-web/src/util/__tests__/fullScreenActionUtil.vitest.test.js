import { describe, expect, it, vi } from 'vitest'

import { createToggleFullScreenAction } from '../fullScreenActionUtil.js'

describe('fullScreenActionUtil', () => {
  it('非全屏时必须发送显式进入全屏指令', async () => {
    const send = vi.fn(() => Promise.resolve())
    const toggleFullScreenAction = createToggleFullScreenAction({
      getIsFullScreen: () => false,
      send,
    })

    await toggleFullScreenAction()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      event: 'full-screen',
      data: true,
    })
    expect(send).not.toHaveBeenCalledWith({
      event: 'full-screen',
    })
  })

  it('已全屏时必须发送显式退出全屏指令', async () => {
    const send = vi.fn(() => Promise.resolve())
    const toggleFullScreenAction = createToggleFullScreenAction({
      getIsFullScreen: () => true,
      send,
    })

    await toggleFullScreenAction()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      event: 'full-screen',
      data: false,
    })
    expect(send).not.toHaveBeenCalledWith({
      event: 'full-screen',
    })
  })
})
