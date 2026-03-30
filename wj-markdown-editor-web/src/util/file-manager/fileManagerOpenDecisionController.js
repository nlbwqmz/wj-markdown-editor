import { Button, message, Modal } from 'ant-design-vue'
import { h } from 'vue'
import {
  requestDocumentOpenPath,
  requestDocumentOpenPathInCurrentWindow,
} from '@/util/document-session/rendererDocumentCommandUtil.js'

function isWindowsCaseInsensitivePath(path) {
  return /^[A-Za-z]:\//u.test(path) || path.startsWith('//')
}

function getUncShareRoot(path) {
  return path.match(/^(\/\/[^/]+\/[^/]+)\/*$/u)?.[1] || null
}

function normalizePath(path) {
  if (typeof path !== 'string') {
    return null
  }

  const normalizedPath = path.trim().replace(/\\/g, '/')
  if (!normalizedPath) {
    return null
  }
  if (normalizedPath === '/') {
    return '/'
  }
  if (/^[A-Za-z]:\/?$/u.test(normalizedPath)) {
    return `${normalizedPath.slice(0, 2)}/`
  }

  const uncShareRoot = getUncShareRoot(normalizedPath)
  if (uncShareRoot) {
    return uncShareRoot
  }

  const trimmedPath = normalizedPath.replace(/\/+$/u, '')
  return trimmedPath || null
}

function normalizeComparablePath(path) {
  const normalizedPath = normalizePath(path)
  if (!normalizedPath) {
    return null
  }

  return isWindowsCaseInsensitivePath(normalizedPath)
    ? normalizedPath.toLowerCase()
    : normalizedPath
}

/**
 * 从文档会话快照里提取“当前已打开 Markdown 路径”。
 *
 * recent-missing 会话没有真实打开的磁盘文件，
 * 这里统一返回 null，避免把缺失项误判成“当前文件重复打开”。
 */
export function resolveDocumentOpenCurrentPath(snapshot) {
  if (snapshot?.isRecentMissing === true) {
    return null
  }

  return normalizePath(snapshot?.resourceContext?.documentPath || snapshot?.displayPath || null)
}

function appendStageList(result, stageList) {
  if (result === false) {
    return false
  }

  if (result && typeof result === 'object') {
    return {
      ...result,
      stageList,
    }
  }

  return {
    ok: Boolean(result),
    reason: result ? 'opened' : 'dispatch-failed',
    stageList,
  }
}

function createThreeWayChoiceModal({
  title,
  content,
  primaryText,
  secondaryText,
  cancelText,
  createModal = config => Modal.confirm(config),
}) {
  return new Promise((resolve) => {
    let resolved = false
    let modalInstance = null
    const settle = (value) => {
      if (resolved) {
        return
      }

      resolved = true
      resolve(value)
    }

    modalInstance = createModal({
      title,
      content,
      centered: true,
      footer: h('div', {
        style: {
          width: '100%',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          paddingTop: '8px',
        },
      }, [
        h(Button, {
          onClick: () => {
            modalInstance?.destroy?.()
            settle('cancel')
          },
        }, () => cancelText),
        h(Button, {
          onClick: () => {
            modalInstance?.destroy?.()
            settle('secondary')
          },
        }, () => secondaryText),
        h(Button, {
          type: 'primary',
          onClick: () => {
            modalInstance?.destroy?.()
            settle('primary')
          },
        }, () => primaryText),
      ]),
      onCancel: () => {
        settle('cancel')
      },
    })
  })
}

export function createDefaultPromptOpenModeChoice(t, {
  createModal = config => Modal.confirm(config),
} = {}) {
  return async () => {
    const choice = await createThreeWayChoiceModal({
      title: t('message.fileManagerOpenModeTitle'),
      content: t('message.fileManagerOpenModeTip'),
      primaryText: t('message.fileManagerOpenInCurrentWindow'),
      secondaryText: t('message.fileManagerOpenInNewWindow'),
      cancelText: t('cancelText'),
      createModal,
    })

    if (choice === 'primary') {
      return 'current-window'
    }

    if (choice === 'secondary') {
      return 'new-window'
    }

    return 'cancel'
  }
}

export function createDefaultPromptSaveChoice(t, {
  createModal = config => Modal.confirm(config),
} = {}) {
  return async () => {
    const choice = await createThreeWayChoiceModal({
      title: t('message.fileManagerSaveBeforeSwitchTitle'),
      content: t('message.theCurrentFileIsNotSaved'),
      primaryText: t('message.fileManagerSaveBeforeSwitch'),
      secondaryText: t('message.fileManagerDiscardAndSwitch'),
      cancelText: t('cancelText'),
      createModal,
    })

    if (choice === 'primary') {
      return 'save-before-switch'
    }

    if (choice === 'secondary') {
      return 'discard-switch'
    }

    return 'cancel'
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
  createDefaultPromptOpenModeChoice,
  createDefaultPromptSaveChoice,
  createFileManagerOpenDecisionController,
  resolveDocumentOpenCurrentPath,
}
