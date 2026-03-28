import { clipboard, dialog, nativeImage, shell } from 'electron'
import fs from 'fs-extra'
import { createDocumentCommandService } from './documentCommandService.js'
import { createDocumentEffectService } from './documentEffectService.js'
import { createDocumentResourceService } from './documentResourceService.js'
import { createDocumentSessionStore } from './documentSessionStore.js'
import { createSaveCoordinator } from './saveCoordinator.js'
import { createWindowSessionBridge } from './windowSessionBridge.js'

/**
 * 统一组装 document-session runtime 运行时依赖。
 *
 * 组合根只负责依赖创建，不负责 runtime 单例初始化和宿主行为注入。
 */
export function createDocumentSessionRuntimeComposition({
  registry,
  getConfig = () => ({}),
  recentStore,
  sendToRenderer = () => {},
  showItemInFolder = shell.showItemInFolder,
  fsModule = fs,
  dialogApi = dialog,
  clipboardApi = clipboard,
  nativeImageApi = nativeImage,
  fetchImpl = globalThis.fetch || null,
} = {}) {
  const store = createDocumentSessionStore()
  const saveCoordinator = createSaveCoordinator()
  const commandService = createDocumentCommandService({
    store,
    saveCoordinator,
    getConfig,
  })
  const effectService = createDocumentEffectService({
    fsModule,
    dialogApi,
    recentStore,
    getConfig,
  })
  const windowBridge = createWindowSessionBridge({
    store,
    sendToRenderer,
    resolveWindowById: (windowId) => {
      return registry?.getWindowById?.(windowId) || null
    },
    getAllWindows: () => {
      return registry?.getAllWindows?.() || []
    },
  })
  const resourceService = createDocumentResourceService({
    store,
    showItemInFolder,
    dialogApi,
    clipboardApi,
    nativeImageApi,
    fsModule,
    fetchImpl,
  })

  return {
    store,
    saveCoordinator,
    commandService,
    effectService,
    windowBridge,
    resourceService,
  }
}

export default {
  createDocumentSessionRuntimeComposition,
}
