import { dialog, shell } from 'electron'
import fs from 'fs-extra'
import { createDocumentCommandService } from './documentCommandService.js'
import { createDocumentDirectoryWatchService } from './documentDirectoryWatchService.js'
import { createDocumentEffectService } from './documentEffectService.js'
import { createDocumentFileManagerService } from './documentFileManagerService.js'
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
  fetchImpl = globalThis.fetch || null,
} = {}) {
  const store = createDocumentSessionStore()
  const saveCoordinator = createSaveCoordinator()
  const commandService = createDocumentCommandService({
    store,
    saveCoordinator,
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
  let fileManagerService = null
  const directoryWatchService = createDocumentDirectoryWatchService({
    fsModule,
    readDirectoryState: async ({ directoryPath, activePath }) => {
      return await fileManagerService.readDirectoryState({
        directoryPath,
        activePath,
      })
    },
    publishDirectoryChanged: ({ windowId, directoryState }) => {
      return windowBridge.publishFileManagerDirectoryChanged?.({
        windowId,
        directoryState,
      })
    },
  })
  fileManagerService = createDocumentFileManagerService({
    store,
    fsModule,
    directoryWatchService,
  })
  const effectService = createDocumentEffectService({
    fsModule,
    dialogApi,
    recentStore,
    getConfig,
    fileManagerService,
  })
  const resourceService = createDocumentResourceService({
    store,
    showItemInFolder,
    dialogApi,
    fsModule,
    fetchImpl,
    resolveWindowById: (windowId) => {
      return registry?.getWindowById?.(windowId) || null
    },
  })

  return {
    store,
    saveCoordinator,
    commandService,
    effectService,
    fileManagerService,
    directoryWatchService,
    windowBridge,
    resourceService,
  }
}

export default {
  createDocumentSessionRuntimeComposition,
}
