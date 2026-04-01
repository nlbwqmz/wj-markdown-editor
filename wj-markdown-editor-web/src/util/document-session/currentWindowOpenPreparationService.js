let activePreparationHandler = null
let activePreparationProvider = null

/**
 * 注册宿主级准备处理器。
 *
 * HomeView 作为 owner 只应有一个有效处理器，
 * 新注册会直接替换旧处理器。
 *
 * @param {Function | null | undefined} handler
 * @returns {Function} 返回用于注销当前准备处理器的清理函数。
 */
export function registerCurrentWindowOpenPreparation(handler) {
  activePreparationHandler = typeof handler === 'function' ? handler : null

  return () => {
    if (activePreparationHandler === handler) {
      activePreparationHandler = null
    }
  }
}

/**
 * 设置当前活动视图提供的准备能力。
 *
 * EditorView / PreviewView 只负责暴露自己的稳定化逻辑，
 * 不直接成为最终 owner。
 *
 * @param {Function | null | undefined} provider
 * @returns {Function} 返回用于移除当前视图准备能力的清理函数。
 */
export function setCurrentWindowOpenPreparationProvider(provider) {
  activePreparationProvider = typeof provider === 'function' ? provider : null

  return () => {
    if (activePreparationProvider === provider) {
      activePreparationProvider = null
    }
  }
}

/**
 * 请求当前窗口切换前准备结果。
 *
 * @param {object} options
 * @returns {Promise<object>} 返回当前窗口切换前的结构化准备结果。
 */
export async function requestCurrentWindowOpenPreparation(options = {}) {
  if (typeof activePreparationHandler !== 'function') {
    return {
      ok: false,
      reason: 'preparation-unavailable',
    }
  }

  return await activePreparationHandler({
    ...options,
    provider: activePreparationProvider,
  })
}

export default {
  registerCurrentWindowOpenPreparation,
  setCurrentWindowOpenPreparationProvider,
  requestCurrentWindowOpenPreparation,
}
