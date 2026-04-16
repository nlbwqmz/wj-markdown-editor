import { createSetConfigPathRequest, sendConfigMutationRequest } from './configMutationCommandUtil.js'
import { getConfigUpdateFailureMessageKey } from './configUpdateResultUtil.js'
import {
  cloneConfigDraft,
  createAutoSaveOptionMutationOperations,
  setConfigDraftValueByPath,
} from './settingConfigDraftUtil.js'

const AUTO_SAVE_OPTION_ORDER = ['blur', 'close']

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

function createPathOverlayDescriptor(path, value) {
  return {
    key: `path:${path.map(item => String(item)).join('.')}`,
    type: 'path',
    path: [...path],
    value: cloneConfigDraft(value),
  }
}

function createAutoSaveOverlayDescriptor(nextAutoSave) {
  return {
    key: 'autoSave',
    type: 'autoSave',
    value: Array.isArray(nextAutoSave) ? [...nextAutoSave] : [],
  }
}

function createShortcutKeyOverlayDescriptor(id, field, value) {
  return {
    key: `shortcut:${id}:${field}`,
    type: 'shortcut',
    id,
    field,
    value: cloneConfigDraft(value),
  }
}

function getValueByPath(source, path) {
  if (!source || !Array.isArray(path) || path.length === 0) {
    return undefined
  }

  return path.reduce((current, key) => current?.[key], source)
}

function setShortcutKeyDraftField(draftConfig, id, field, value) {
  const shortcutKey = draftConfig?.shortcutKeyList?.find(item => item.id === id)
  if (!shortcutKey) {
    return false
  }

  shortcutKey[field] = cloneConfigDraft(value)
  return true
}

function getShortcutKeyFieldValue(config, id, field) {
  return config?.shortcutKeyList?.find(item => item.id === id)?.[field]
}

function normalizeAutoSaveComparableValue(value) {
  const optionSet = new Set(Array.isArray(value) ? value : [])
  return AUTO_SAVE_OPTION_ORDER.filter(option => optionSet.has(option))
}

function isEqualValue(leftValue, rightValue) {
  return JSON.stringify(leftValue) === JSON.stringify(rightValue)
}

function applyOverlayDescriptorToDraft(draftConfig, descriptor) {
  if (!draftConfig || !descriptor) {
    return false
  }

  if (descriptor.type === 'path') {
    return setConfigDraftValueByPath(draftConfig, descriptor.path, descriptor.value)
  }

  if (descriptor.type === 'autoSave') {
    draftConfig.autoSave = cloneConfigDraft(descriptor.value)
    return true
  }

  if (descriptor.type === 'shortcut') {
    return setShortcutKeyDraftField(draftConfig, descriptor.id, descriptor.field, descriptor.value)
  }

  return false
}

function readOverlayComparableValueFromStore(storeConfig, descriptor) {
  if (!descriptor) {
    return undefined
  }

  if (descriptor.type === 'path') {
    return cloneConfigDraft(getValueByPath(storeConfig, descriptor.path))
  }

  if (descriptor.type === 'autoSave') {
    return normalizeAutoSaveComparableValue(storeConfig?.autoSave)
  }

  if (descriptor.type === 'shortcut') {
    return cloneConfigDraft(getShortcutKeyFieldValue(storeConfig, descriptor.id, descriptor.field))
  }

  return undefined
}

function readOverlayComparableValue(descriptor) {
  if (!descriptor) {
    return undefined
  }

  if (descriptor.type === 'autoSave') {
    return normalizeAutoSaveComparableValue(descriptor.value)
  }

  return cloneConfigDraft(descriptor.value)
}

/**
 * 统一处理设置页 mutation 提交、乐观草稿 overlay、外部 store 同步与失败回滚。
 */
export function createSettingConfigMutationController(options = {}) {
  const {
    getDraftConfig,
    getStoreConfig,
    setDraftConfig,
    sendMutationRequest = sendConfigMutationRequest,
    showWarningMessage = () => {},
    afterMutationSuccess = () => {},
  } = options

  let latestStoreConfig = cloneConfigDraft(getStoreConfig?.())
  let latestRequestId = 0
  const overlayDescriptorMap = new Map()

  function resolveCurrentStoreConfig() {
    return cloneConfigDraft(getStoreConfig?.()) ?? cloneConfigDraft(latestStoreConfig)
  }

  function composeDraftFromStore(storeConfig = latestStoreConfig ?? getStoreConfig?.()) {
    const nextDraftConfig = cloneConfigDraft(storeConfig)
    if (!nextDraftConfig) {
      return nextDraftConfig
    }

    overlayDescriptorMap.forEach((descriptor) => {
      applyOverlayDescriptorToDraft(nextDraftConfig, descriptor)
    })

    return nextDraftConfig
  }

  function replaceDraftConfig(nextDraftConfig) {
    if (nextDraftConfig == null) {
      return nextDraftConfig
    }

    setDraftConfig?.(nextDraftConfig)
    return nextDraftConfig
  }

  function syncStoreConfig(nextStoreConfig) {
    latestStoreConfig = cloneConfigDraft(nextStoreConfig)

    overlayDescriptorMap.forEach((descriptor, key) => {
      const storeValue = readOverlayComparableValueFromStore(latestStoreConfig, descriptor)
      const overlayValue = readOverlayComparableValue(descriptor)
      if (isEqualValue(storeValue, overlayValue)) {
        overlayDescriptorMap.delete(key)
      }
    })

    return replaceDraftConfig(composeDraftFromStore(latestStoreConfig))
  }

  function applyOptimisticOverlay(descriptorList) {
    if (!Array.isArray(descriptorList) || descriptorList.length === 0) {
      return getDraftConfig?.()
    }

    const nextDraftConfig = cloneConfigDraft(getDraftConfig?.()) ?? composeDraftFromStore()
    descriptorList.forEach((descriptor) => {
      applyOverlayDescriptorToDraft(nextDraftConfig, descriptor)
    })
    return replaceDraftConfig(nextDraftConfig)
  }

  function registerOverlayDescriptorList(descriptorList) {
    const requestId = ++latestRequestId
    descriptorList.forEach((descriptor) => {
      overlayDescriptorMap.set(descriptor.key, {
        ...descriptor,
        requestId,
      })
    })
    return requestId
  }

  function resolveActiveOverlayDescriptorList(requestId, descriptorList) {
    return descriptorList.filter(descriptor => overlayDescriptorMap.get(descriptor.key)?.requestId === requestId)
  }

  function rollbackActiveOverlayDescriptorList(requestId, descriptorList, messageKey) {
    const activeDescriptorList = resolveActiveOverlayDescriptorList(requestId, descriptorList)
    if (activeDescriptorList.length === 0) {
      return {
        ok: false,
        stale: true,
        messageKey,
      }
    }

    activeDescriptorList.forEach(descriptor => overlayDescriptorMap.delete(descriptor.key))
    latestStoreConfig = resolveCurrentStoreConfig()
    const nextDraftConfig = composeDraftFromStore(latestStoreConfig)
    replaceDraftConfig(nextDraftConfig)
    showWarningMessage(messageKey)
    return {
      ok: false,
      messageKey,
      nextConfig: nextDraftConfig,
    }
  }

  function rollbackResetFailure(messageKey) {
    latestStoreConfig = resolveCurrentStoreConfig()
    const nextDraftConfig = composeDraftFromStore(latestStoreConfig)
    replaceDraftConfig(nextDraftConfig)
    showWarningMessage(messageKey)
    return {
      ok: false,
      messageKey,
      nextConfig: nextDraftConfig,
    }
  }

  async function submitRequest(request, descriptorList = []) {
    const requestId = registerOverlayDescriptorList(descriptorList)
    applyOptimisticOverlay(descriptorList)

    try {
      const result = await sendMutationRequest(request)
      const failureMessageKey = getConfigUpdateFailureMessageKey(result)
      if (failureMessageKey) {
        return rollbackActiveOverlayDescriptorList(requestId, descriptorList, failureMessageKey)
      }

      if (result?.config) {
        syncStoreConfig(result.config)
      }

      afterMutationSuccess()
      return result
    }
    catch {
      return rollbackActiveOverlayDescriptorList(requestId, descriptorList, 'message.configWriteFailed')
    }
  }

  return {
    syncStoreConfig,
    submitSetPath(path, value) {
      const descriptor = createPathOverlayDescriptor(path, value)
      return submitRequest(createSetConfigPathRequest(path, value), [descriptor])
    },
    submitAutoSaveListChange(previousAutoSave, nextAutoSave) {
      const operations = createAutoSaveOptionMutationOperations(previousAutoSave, nextAutoSave)
      if (operations.length === 0) {
        return Promise.resolve({ ok: true, skipped: true })
      }

      const descriptor = createAutoSaveOverlayDescriptor(nextAutoSave)
      return submitRequest({ operations }, [descriptor])
    },
    submitShortcutKeyField(id, field, value) {
      const descriptor = createShortcutKeyOverlayDescriptor(id, field, value)
      return submitRequest(createShortcutKeyFieldRequest(id, field, value), [descriptor])
    },
    async submitReset() {
      overlayDescriptorMap.clear()
      latestStoreConfig = resolveCurrentStoreConfig()
      replaceDraftConfig(composeDraftFromStore(latestStoreConfig))

      try {
        const result = await sendMutationRequest(createResetRequest())
        const failureMessageKey = getConfigUpdateFailureMessageKey(result)
        if (failureMessageKey) {
          return rollbackResetFailure(failureMessageKey)
        }

        if (result?.config) {
          syncStoreConfig(result.config)
        }

        afterMutationSuccess()
        return result
      }
      catch {
        return rollbackResetFailure('message.configWriteFailed')
      }
    },
  }
}

export default {
  createSettingConfigMutationController,
}
