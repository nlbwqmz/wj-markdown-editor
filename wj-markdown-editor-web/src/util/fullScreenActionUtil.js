import channelUtil from '@/util/channel/channelUtil.js'

/**
 * 创建全屏切换共享动作。
 * 这里必须发送显式布尔值，不能向宿主发送无参 toggle。
 */
function createToggleFullScreenAction({
  getIsFullScreen,
  send,
}) {
  return async () => {
    const nextIsFullScreen = !await getIsFullScreen()
    return await send({
      event: 'full-screen',
      data: nextIsFullScreen,
    })
  }
}

const toggleFullScreenAction = createToggleFullScreenAction({
  getIsFullScreen: async () => {
    const { useCommonStore } = await import('@/stores/counter.js')
    return useCommonStore().isFullScreen
  },
  send: payload => channelUtil.send(payload),
})

export {
  createToggleFullScreenAction,
}

export default toggleFullScreenAction
