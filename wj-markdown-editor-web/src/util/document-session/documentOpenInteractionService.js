/**
 * 创建统一文档打开交互 service。
 *
 * 当前阶段只先收口：
 * 1. open dialog 结果结构化
 * 2. 宿主级打开处理器注册
 * 3. 新请求到来时让旧请求失效
 *
 * Task 2 再把真正的四段式打开决策接进来。
 *
 * @param {object} options
 * @param {Function} [options.requestDocumentOpenDialog]
 * @param {Function} [options.performOpen]
 * @param {Function} [options.destroyActiveDialog]
 * @returns {object} 统一打开交互 service 实例。
 */
export function createDocumentOpenInteractionService(options = {}) {
  const requestDocumentOpenDialog = typeof options.requestDocumentOpenDialog === 'function'
    ? options.requestDocumentOpenDialog
    : async () => null
  const destroyActiveDialog = typeof options.destroyActiveDialog === 'function'
    ? options.destroyActiveDialog
    : () => {}

  let openHandler = typeof options.performOpen === 'function'
    ? options.performOpen
    : null
  let activeRequestId = 0
  let activeRequestReject = null
  let activeDialogDestroyer = null

  function clearActiveDialogDestroyer() {
    activeDialogDestroyer = null
  }

  function destroyCurrentDialog() {
    if (typeof activeDialogDestroyer === 'function') {
      const destroyer = activeDialogDestroyer
      activeDialogDestroyer = null
      destroyer()
      return
    }

    destroyActiveDialog()
  }

  function invalidateActiveRequest() {
    activeRequestId += 1
    if (typeof activeRequestReject === 'function' || typeof activeDialogDestroyer === 'function') {
      destroyCurrentDialog()
    }
    if (typeof activeRequestReject === 'function') {
      const reject = activeRequestReject
      activeRequestReject = null
      reject({
        ok: false,
        reason: 'request-invalidated',
      })
    }
  }

  function setOpenHandler(handler) {
    openHandler = typeof handler === 'function' ? handler : null
    return () => {
      if (openHandler === handler) {
        openHandler = null
      }
    }
  }

  /**
   * 兼容主进程新旧 open dialog 返回协议。
   *
   * 旧协议直接返回字符串路径，
   * 新协议返回 { ok, reason, path } 结构；
   * renderer 统一在这一层归一化，避免菜单和快捷键继续关心协议细节。
   */
  function normalizeDocumentOpenDialogResult(dialogResult) {
    if (typeof dialogResult === 'string' && dialogResult) {
      return {
        ok: true,
        reason: 'selected',
        path: dialogResult,
      }
    }

    if (dialogResult && typeof dialogResult === 'object') {
      const normalizedPath = typeof dialogResult.path === 'string' && dialogResult.path
        ? dialogResult.path
        : null
      if (dialogResult.ok === true && normalizedPath) {
        return {
          ok: true,
          reason: typeof dialogResult.reason === 'string' && dialogResult.reason
            ? dialogResult.reason
            : 'selected',
          path: normalizedPath,
        }
      }
      if (dialogResult.ok === false) {
        return {
          ok: false,
          reason: typeof dialogResult.reason === 'string' && dialogResult.reason
            ? dialogResult.reason
            : 'cancelled',
          path: normalizedPath,
        }
      }
    }

    return {
      ok: false,
      reason: 'cancelled',
      path: null,
    }
  }

  async function requestDocumentOpenByDialog() {
    return normalizeDocumentOpenDialogResult(await requestDocumentOpenDialog())
  }

  function requestDocumentOpenPath(path, options = {}) {
    if (typeof openHandler !== 'function') {
      return Promise.resolve({
        ok: false,
        reason: 'interaction-unavailable',
        path: typeof path === 'string' ? path : null,
      })
    }

    invalidateActiveRequest()
    activeRequestId += 1
    const currentRequestId = activeRequestId
    const isInteractionActive = () => currentRequestId === activeRequestId
    const setActiveDialogDestroyer = (destroyer) => {
      if (isInteractionActive() !== true) {
        if (typeof destroyer === 'function') {
          destroyer()
        }
        return
      }

      activeDialogDestroyer = typeof destroyer === 'function'
        ? destroyer
        : null
    }

    return new Promise((resolve, reject) => {
      activeRequestReject = reject

      Promise.resolve(openHandler({
        path,
        ...options,
        isInteractionActive,
        setActiveDialogDestroyer,
      }))
        .then((result) => {
          if (currentRequestId !== activeRequestId) {
            return
          }
          activeRequestReject = null
          clearActiveDialogDestroyer()
          resolve(result)
        })
        .catch((error) => {
          if (currentRequestId !== activeRequestId) {
            return
          }
          activeRequestReject = null
          clearActiveDialogDestroyer()
          reject(error)
        })
    })
  }

  return {
    setOpenHandler,
    invalidateActiveRequest,
    requestDocumentOpenByDialog,
    requestDocumentOpenPath,
  }
}

let activeDocumentOpenInteractionService = null

function resolveInteractionUnavailableResult(path) {
  return {
    ok: false,
    reason: 'interaction-unavailable',
    path: typeof path === 'string' ? path : null,
  }
}

function normalizeInvalidatedInteractionResult(error, fallbackPath = null) {
  if (error?.reason !== 'request-invalidated') {
    throw error
  }

  return {
    ok: false,
    reason: 'request-invalidated',
    path: typeof error?.path === 'string'
      ? error.path
      : typeof fallbackPath === 'string'
        ? fallbackPath
        : null,
  }
}

/**
 * 注册当前页面可见的统一打开交互 service。
 *
 * HomeView 作为宿主只保留一份活动实例，
 * 菜单、快捷键和文件树都通过这里找到同一个宿主。
 *
 * @param {object | null | undefined} service
 * @returns {Function} 用于撤销当前宿主注册的清理函数。
 */
export function registerDocumentOpenInteractionService(service) {
  activeDocumentOpenInteractionService = service && typeof service === 'object'
    ? service
    : null

  return () => {
    if (activeDocumentOpenInteractionService === service) {
      activeDocumentOpenInteractionService = null
    }
  }
}

/**
 * 获取当前活动的统一打开交互 service。
 *
 * @returns {object | null} 当前活动的宿主 service；不存在时返回 null。
 */
export function getDocumentOpenInteractionService() {
  return activeDocumentOpenInteractionService
}

/**
 * 让外部入口直接复用宿主的“打开已知路径”编排。
 *
 * @param {string} path
 * @param {object} [options]
 * @returns {Promise<object>} 宿主编排返回的结构化打开结果。
 */
export function requestDocumentOpenPathByInteraction(path, options = {}) {
  const service = getDocumentOpenInteractionService()
  if (typeof service?.requestDocumentOpenPath !== 'function') {
    return Promise.resolve(resolveInteractionUnavailableResult(path))
  }

  return service.requestDocumentOpenPath(path, options)
    .catch(error => normalizeInvalidatedInteractionResult(error, path))
}

/**
 * 让“文件 -> 打开 / 快捷键打开”先选路径，再回流统一打开交互。
 *
 * @param {object} [options]
 * @returns {Promise<object>} 选路径并回流宿主编排后的最终结果。
 */
export async function requestDocumentOpenByDialogAndOpen(options = {}) {
  const service = getDocumentOpenInteractionService()
  if (typeof service?.requestDocumentOpenByDialog !== 'function'
    || typeof service?.requestDocumentOpenPath !== 'function') {
    return resolveInteractionUnavailableResult(null)
  }

  // 系统文件选择框弹出前先作废上一轮交互，
  // 避免旧弹窗在本轮取消后仍可继续提交上一轮目标。
  if (typeof service?.invalidateActiveRequest === 'function') {
    service.invalidateActiveRequest()
  }

  const dialogResult = await service.requestDocumentOpenByDialog()
  if (dialogResult?.ok !== true || typeof dialogResult?.path !== 'string' || !dialogResult.path) {
    return dialogResult || {
      ok: false,
      reason: 'cancelled',
      path: null,
    }
  }

  try {
    return await service.requestDocumentOpenPath(dialogResult.path, options)
  } catch (error) {
    return normalizeInvalidatedInteractionResult(error, dialogResult.path)
  }
}

export default {
  createDocumentOpenInteractionService,
  registerDocumentOpenInteractionService,
  getDocumentOpenInteractionService,
  requestDocumentOpenPathByInteraction,
  requestDocumentOpenByDialogAndOpen,
}
