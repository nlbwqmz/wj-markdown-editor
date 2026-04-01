import { Button, message, Modal } from 'ant-design-vue'
import { h } from 'vue'
import { requestCurrentWindowOpenPreparation } from '@/util/document-session/currentWindowOpenPreparationService.js'
import {
  requestDocumentOpenPath,
  requestDocumentOpenPathInCurrentWindow,
  requestDocumentResolveOpenTarget,
  requestPrepareOpenPathInCurrentWindow,
} from '@/util/document-session/rendererDocumentCommandUtil.js'

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

function resolveResultDecision(result) {
  if (!result || typeof result !== 'object') {
    return null
  }

  return typeof result.decision === 'string'
    ? result.decision
    : typeof result.reason === 'string'
      ? result.reason
      : null
}

function isFocusedExistingWindowResult(result) {
  return resolveResultDecision(result) === 'focused-existing-window'
}

function resolveOpenInteractionMeta(options = {}) {
  return {
    entrySource: typeof options.entrySource === 'string' && options.entrySource
      ? options.entrySource
      : undefined,
    trigger: typeof options.trigger === 'string' && options.trigger
      ? options.trigger
      : 'user',
  }
}

function createThreeWayChoiceModal({
  title,
  content,
  primaryText,
  secondaryText,
  cancelText,
  createModal = config => Modal.confirm(config),
  registerDestroyer = null,
}) {
  return new Promise((resolve) => {
    let resolved = false
    let modalInstance = null
    const clearRegisteredDestroyer = () => {
      if (typeof registerDestroyer === 'function') {
        registerDestroyer(null)
      }
    }
    const settle = (value) => {
      if (resolved) {
        return
      }

      resolved = true
      clearRegisteredDestroyer()
      resolve(value)
    }
    const closeWith = (value) => {
      modalInstance?.destroy?.()
      settle(value)
    }

    modalInstance = createModal({
      title,
      content,
      centered: true,
      width: 600,
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
            closeWith('cancel')
          },
        }, () => cancelText),
        h(Button, {
          onClick: () => {
            closeWith('secondary')
          },
        }, () => secondaryText),
        h(Button, {
          type: 'primary',
          onClick: () => {
            closeWith('primary')
          },
        }, () => primaryText),
      ]),
      onCancel: () => {
        settle('cancel')
      },
    })

    if (typeof registerDestroyer === 'function') {
      registerDestroyer(() => {
        closeWith('cancel')
      })
    }
  })
}

export function createDefaultPromptOpenModeChoice(t, {
  createModal = config => Modal.confirm(config),
} = {}) {
  return async ({ setActiveDialogDestroyer } = {}) => {
    const choice = await createThreeWayChoiceModal({
      title: t('message.fileManagerOpenModeTitle'),
      content: t('message.fileManagerOpenModeTip'),
      primaryText: t('message.fileManagerOpenInCurrentWindow'),
      secondaryText: t('message.fileManagerOpenInNewWindow'),
      cancelText: t('cancelText'),
      createModal,
      registerDestroyer: setActiveDialogDestroyer,
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
  return async ({ setActiveDialogDestroyer } = {}) => {
    const choice = await createThreeWayChoiceModal({
      title: t('message.fileManagerSaveBeforeSwitchTitle'),
      content: t('message.theCurrentFileIsNotSaved'),
      primaryText: t('message.fileManagerSaveBeforeSwitch'),
      secondaryText: t('message.fileManagerDiscardAndSwitch'),
      cancelText: t('cancelText'),
      createModal,
      registerDestroyer: setActiveDialogDestroyer,
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
  requestDocumentResolveOpenTarget: requestResolveOpenTarget = requestDocumentResolveOpenTarget,
  requestPrepareOpenPathInCurrentWindow: requestPrepareCurrentWindowOpen = requestPrepareOpenPathInCurrentWindow,
  requestDocumentOpenPath: requestOpenPath = requestDocumentOpenPath,
  requestDocumentOpenPathInCurrentWindow: requestOpenPathInCurrentWindow = requestDocumentOpenPathInCurrentWindow,
  requestCurrentWindowOpenPreparation: requestPreparation = requestCurrentWindowOpenPreparation,
  promptOpenModeChoice = createDefaultPromptOpenModeChoice(t),
  promptSaveChoice = createDefaultPromptSaveChoice(t),
  showInfoMessage = messageKey => message.info(t(messageKey)),
  showErrorMessage = messageKey => message.error(t(messageKey)),
  notifySourceSessionChanged = () => message.warning(t('message.fileManagerSourceSessionChanged')),
} = {}) {
  async function openDocument(targetPath, options = {}) {
    const stageList = []
    const interactionMeta = resolveOpenInteractionMeta(options)
    const isInteractionActive = typeof options.isInteractionActive === 'function'
      ? options.isInteractionActive
      : () => true
    const setActiveDialogDestroyer = typeof options.setActiveDialogDestroyer === 'function'
      ? options.setActiveDialogDestroyer
      : () => {}
    const resolveInvalidatedResult = () => ({
      ok: false,
      reason: 'request-invalidated',
      path: targetPath,
      stageList: [...stageList],
    })
    const stopIfInactive = () => {
      return isInteractionActive() === true
        ? null
        : resolveInvalidatedResult()
    }
    const initialInvalidatedResult = stopIfInactive()
    if (initialInvalidatedResult) {
      return initialInvalidatedResult
    }

    stageList.push('target-preflight')
    const targetPreflightResult = await requestResolveOpenTarget(targetPath, {
      ...interactionMeta,
    })
    const targetPreflightInvalidatedResult = stopIfInactive()
    if (targetPreflightInvalidatedResult) {
      return targetPreflightInvalidatedResult
    }
    if (isFocusedExistingWindowResult(targetPreflightResult)) {
      showInfoMessage('message.fileAlreadyOpenedInOtherWindow')
    }
    if (targetPreflightResult?.decision !== 'needs-open-mode-choice') {
      return appendStageList(targetPreflightResult, stageList)
    }

    stageList.push('open-choice')
    const selectedOpenMode = options.openMode || await promptOpenModeChoice({
      targetPath,
      ...interactionMeta,
      setActiveDialogDestroyer,
    })
    const openChoiceInvalidatedResult = stopIfInactive()
    if (openChoiceInvalidatedResult) {
      return openChoiceInvalidatedResult
    }

    if (!selectedOpenMode || selectedOpenMode === 'cancel') {
      return {
        ok: false,
        reason: 'open-cancelled',
        stageList,
      }
    }

    if (selectedOpenMode === 'new-window') {
      stageList.push('dispatch')
      const beforeNewWindowDispatchInvalidatedResult = stopIfInactive()
      if (beforeNewWindowDispatchInvalidatedResult) {
        return beforeNewWindowDispatchInvalidatedResult
      }
      const dispatchResult = await requestOpenPath(targetPath, {
        ...interactionMeta,
      })
      const newWindowDispatchInvalidatedResult = stopIfInactive()
      if (newWindowDispatchInvalidatedResult) {
        return newWindowDispatchInvalidatedResult
      }
      if (isFocusedExistingWindowResult(dispatchResult)) {
        showInfoMessage('message.fileAlreadyOpenedInOtherWindow')
      }
      return appendStageList(dispatchResult, stageList)
    }

    stageList.push('current-window-preflight')
    const preparationResult = await requestPreparation({
      path: targetPath,
      ...interactionMeta,
    })
    const preparationInvalidatedResult = stopIfInactive()
    if (preparationInvalidatedResult) {
      return preparationInvalidatedResult
    }
    if (preparationResult?.ok !== true || !preparationResult?.snapshot) {
      return appendStageList(preparationResult, stageList)
    }

    const sourceSessionId = preparationResult.snapshot.sessionId
    const sourceRevision = preparationResult.snapshot.revision
    const currentWindowPreflightResult = await requestPrepareCurrentWindowOpen(targetPath, {
      ...interactionMeta,
      sourceSessionId,
      sourceRevision,
    })
    const currentWindowPreflightInvalidatedResult = stopIfInactive()
    if (currentWindowPreflightInvalidatedResult) {
      return currentWindowPreflightInvalidatedResult
    }
    if (isFocusedExistingWindowResult(currentWindowPreflightResult)) {
      showInfoMessage('message.fileAlreadyOpenedInOtherWindow')
    }
    if (currentWindowPreflightResult?.decision !== 'needs-save-choice'
      && currentWindowPreflightResult?.decision !== 'ready-to-switch') {
      return appendStageList(currentWindowPreflightResult, stageList)
    }

    let switchPolicy = 'direct-switch'
    if (currentWindowPreflightResult?.decision === 'needs-save-choice') {
      stageList.push('save-choice')
      const selectedSaveChoice = options.saveChoice || await promptSaveChoice({
        targetPath,
        ...interactionMeta,
        setActiveDialogDestroyer,
      })
      const saveChoiceInvalidatedResult = stopIfInactive()
      if (saveChoiceInvalidatedResult) {
        return saveChoiceInvalidatedResult
      }

      if (!selectedSaveChoice || selectedSaveChoice === 'cancel') {
        return {
          ok: false,
          reason: 'open-cancelled',
          stageList,
        }
      }

      switchPolicy = selectedSaveChoice
    }

    stageList.push('dispatch')
    const beforeCurrentWindowDispatchInvalidatedResult = stopIfInactive()
    if (beforeCurrentWindowDispatchInvalidatedResult) {
      return beforeCurrentWindowDispatchInvalidatedResult
    }
    const dispatchResult = await requestOpenPathInCurrentWindow(targetPath, {
      ...interactionMeta,
      switchPolicy,
      expectedSessionId: sourceSessionId,
      expectedRevision: sourceRevision,
    })
    const currentWindowDispatchInvalidatedResult = stopIfInactive()
    if (currentWindowDispatchInvalidatedResult) {
      return currentWindowDispatchInvalidatedResult
    }
    if (isFocusedExistingWindowResult(dispatchResult)) {
      showInfoMessage('message.fileAlreadyOpenedInOtherWindow')
    }
    if (dispatchResult?.reason === 'save-before-switch-failed') {
      showErrorMessage('message.fileManagerSaveBeforeSwitchFailed')
    }
    if (dispatchResult?.reason === 'open-current-window-switch-failed') {
      showErrorMessage('message.fileManagerOpenCurrentWindowFailed')
    }
    if (dispatchResult?.reason === 'source-session-changed') {
      notifySourceSessionChanged()
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
