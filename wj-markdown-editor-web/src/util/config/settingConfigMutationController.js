import { createSetConfigPathRequest, sendConfigMutationRequest } from './configMutationCommandUtil.js'
import {
  createAutoSaveOptionMutationOperations,
  createTransportConfigUpdateFailureRecovery,
  resolveConfigUpdateFailureRecovery,
} from './settingConfigDraftUtil.js'

function createShortcutKeyFieldRequest(id, field, value) {
  return {
    operations: [
      {
        type: 'setShortcutKeyField',
        id,
        field,
        value,
      },
    ],
  }
}

function createResetRequest() {
  return {
    operations: [
      {
        type: 'reset',
      },
    ],
  }
}

/**
 * 统一处理设置页 mutation 提交、结构化失败回滚与传输层失败回滚。
 */
export function createSettingConfigMutationController(options = {}) {
  const {
    getStoreConfig,
    setDraftConfig,
    sendMutationRequest = sendConfigMutationRequest,
    showWarningMessage = () => {},
    afterMutationSuccess = () => {},
  } = options

  async function submitRequest(request) {
    try {
      const result = await sendMutationRequest(request)
      const failureRecovery = resolveConfigUpdateFailureRecovery({
        result,
        storeConfig: getStoreConfig?.(),
      })

      if (failureRecovery) {
        setDraftConfig?.(failureRecovery.nextConfig)
        showWarningMessage(failureRecovery.messageKey)
        return {
          ok: false,
          ...failureRecovery,
        }
      }

      afterMutationSuccess()
      return result
    }
    catch {
      const failureRecovery = createTransportConfigUpdateFailureRecovery({
        storeConfig: getStoreConfig?.(),
      })
      setDraftConfig?.(failureRecovery.nextConfig)
      showWarningMessage(failureRecovery.messageKey)
      return {
        ok: false,
        ...failureRecovery,
      }
    }
  }

  return {
    submitSetPath(path, value) {
      return submitRequest(createSetConfigPathRequest(path, value))
    },
    submitAutoSaveListChange(previousAutoSave, nextAutoSave) {
      const operations = createAutoSaveOptionMutationOperations(previousAutoSave, nextAutoSave)
      if (operations.length === 0) {
        return Promise.resolve({ ok: true, skipped: true })
      }

      return submitRequest({ operations })
    },
    submitShortcutKeyField(id, field, value) {
      return submitRequest(createShortcutKeyFieldRequest(id, field, value))
    },
    submitReset() {
      return submitRequest(createResetRequest())
    },
  }
}

export default {
  createSettingConfigMutationController,
}
