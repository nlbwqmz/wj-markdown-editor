import channelUtil from '@/util/channel/channelUtil.js'

/**
 * 统一发送 renderer 侧配置 mutation 命令，避免各调用点重复拼装事件名。
 */
export function sendConfigMutationRequest(request) {
  return channelUtil.send({
    event: 'config.update',
    data: request,
  })
}

/**
 * 创建单个配置路径的 set mutation request。
 */
export function createSetConfigPathRequest(path, value) {
  return {
    operations: [
      { type: 'set', path, value },
    ],
  }
}

/**
 * 创建多个配置路径的批量 set mutation request。
 */
export function createBatchSetConfigPathRequest(pairList) {
  return {
    operations: pairList.map(item => ({
      type: 'set',
      path: item.path,
      value: item.value,
    })),
  }
}

export default {
  sendConfigMutationRequest,
  createSetConfigPathRequest,
  createBatchSetConfigPathRequest,
}
