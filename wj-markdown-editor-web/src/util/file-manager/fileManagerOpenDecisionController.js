import { message, Modal } from 'ant-design-vue'
import {
  requestDocumentOpenPath,
  requestDocumentOpenPathInCurrentWindow,
} from '@/util/document-session/rendererDocumentCommandUtil.js'

function normalizeComparablePath(path) {
  if (typeof path !== 'string') {
    return null
  }

  const normalizedPath = path.trim().replace(/\\/g, '/').replace(/\/+$/u, '')

  return normalizedPath ? normalizedPath.toLowerCase() : null
}

function appendStageList(result, stageList) {
  if (result && typeof result === 'object') {
    return {
      ...result,
      stageList,
    }
  }

  return {
    ok: Boolean(result),
    reason: result === false ? 'dispatch-failed' : 'opened',
    stageList,
  }
}

function createBinaryChoiceModal({
  title,
  content,
  okText,
  cancelText,
  createModal = config => Modal.confirm(config),
}) {
  return new Promise((resolve) => {
    let resolved = false
    const settle = (value) => {
      if (resolved) {
        return
      }

      resolved = true
      resolve(value)
    }

    createModal({
      title,
      content,
      okText,
      cancelText,
      centered: true,
      onOk: () => {
        settle('ok')
      },
      onCancel: () => {
        settle('cancel')
      },
    })
  })
}

function createDefaultPromptOpenModeChoice(t) {
  return async () => {
    const choice = await createBinaryChoiceModal({
      title: t('message.fileManagerOpenModeTitle'),
      content: t('message.fileManagerOpenModeTip'),
      okText: t('message.fileManagerOpenInCurrentWindow'),
      cancelText: t('message.fileManagerOpenInNewWindow'),
    })

    return choice === 'ok' ? 'current-window' : 'new-window'
  }
}

function createDefaultPromptSaveChoice(t) {
  return async () => {
    const choice = await createBinaryChoiceModal({
      title: t('message.fileManagerSaveBeforeSwitchTitle'),
      content: t('message.theCurrentFileIsNotSaved'),
      okText: t('message.fileManagerSaveBeforeSwitch'),
      cancelText: t('message.fileManagerDiscardAndSwitch'),
    })

    return choice === 'ok' ? 'save-before-switch' : 'discard-switch'
  }
}

/**
 * 统一处理文件管理栏里的“打开 Markdown 文件”决策。
 *
 * 这里把 renderer 侧两层选择都收口：
 * 1. 在当前窗口打开还是新窗口打开
 * 2. 当前窗口切文档前，脏内容是否需要先保存
 */
export function createFileManagerOpenDecisionController({
  t = value => value,
  requestDocumentOpenPath: requestOpenPath = requestDocumentOpenPath,
  requestDocumentOpenPathInCurrentWindow: requestOpenPathInCurrentWindow = requestDocumentOpenPathInCurrentWindow,
  promptOpenModeChoice = createDefaultPromptOpenModeChoice(t),
  promptSaveChoice = createDefaultPromptSaveChoice(t),
  showInfoMessage = messageKey => message.info(t(messageKey)),
} = {}) {
  async function openDocument(targetPath, options = {}) {
    const stageList = []
    const currentPath = normalizeComparablePath(options.currentPath)

    if (normalizeComparablePath(targetPath) === currentPath) {
      return {
        ok: true,
        reason: 'noop-current-file',
        stageList,
      }
    }

    stageList.push('open-choice')
    const selectedOpenMode = options.openMode || await promptOpenModeChoice({
      targetPath,
      currentPath: options.currentPath || null,
      source: options.source || null,
    })

    if (!selectedOpenMode || selectedOpenMode === 'cancel') {
      return {
        ok: false,
        reason: 'open-cancelled',
        stageList,
      }
    }

    if (selectedOpenMode === 'new-window') {
      stageList.push('dispatch')
      const dispatchResult = await requestOpenPath(targetPath, {
        source: options.source,
      })
      if (dispatchResult?.reason === 'focused-existing-window') {
        showInfoMessage('message.fileAlreadyOpenedInOtherWindow')
      }
      return appendStageList(dispatchResult, stageList)
    }

    let selectedSaveChoice = options.saveChoice

    if (options.isDirty === true) {
      stageList.push('save-choice')
      selectedSaveChoice = selectedSaveChoice || await promptSaveChoice({
        targetPath,
        currentPath: options.currentPath || null,
        source: options.source || null,
      })

      if (!selectedSaveChoice || selectedSaveChoice === 'cancel') {
        return {
          ok: false,
          reason: 'open-cancelled',
          stageList,
        }
      }
    }

    stageList.push('dispatch')
    const dispatchResult = await requestOpenPathInCurrentWindow(targetPath, {
      saveBeforeSwitch: selectedSaveChoice === 'save-before-switch',
      source: options.source,
    })
    if (dispatchResult?.reason === 'focused-existing-window') {
      showInfoMessage('message.fileAlreadyOpenedInOtherWindow')
    }
    return appendStageList(dispatchResult, stageList)
  }

  return {
    openDocument,
  }
}

export default {
  createFileManagerOpenDecisionController,
}
