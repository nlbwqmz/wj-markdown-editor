import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  requestDocumentResolveOpenTarget: vi.fn(),
  requestPrepareOpenPathInCurrentWindow: vi.fn(),
  requestDocumentOpenPath: vi.fn(),
  requestDocumentOpenPathInCurrentWindow: vi.fn(),
  requestCurrentWindowOpenPreparation: vi.fn(),
  showInfoMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  notifySourceSessionChanged: vi.fn(),
  promptOpenModeChoice: vi.fn(),
  promptSaveChoice: vi.fn(),
}))

function createDeferred() {
  let resolve = null
  let reject = null
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

function createController(options = {}) {
  return mocked.controllerFactory({
    t: value => value,
    requestDocumentResolveOpenTarget: mocked.requestDocumentResolveOpenTarget,
    requestPrepareOpenPathInCurrentWindow: mocked.requestPrepareOpenPathInCurrentWindow,
    requestDocumentOpenPath: mocked.requestDocumentOpenPath,
    requestDocumentOpenPathInCurrentWindow: mocked.requestDocumentOpenPathInCurrentWindow,
    requestCurrentWindowOpenPreparation: mocked.requestCurrentWindowOpenPreparation,
    showInfoMessage: mocked.showInfoMessage,
    showErrorMessage: mocked.showErrorMessage,
    notifySourceSessionChanged: mocked.notifySourceSessionChanged,
    promptOpenModeChoice: mocked.promptOpenModeChoice,
    promptSaveChoice: mocked.promptSaveChoice,
    ...options,
  })
}

const controllerModule = await import('../fileManagerOpenDecisionController.js')

describe('fileManagerOpenDecisionController', () => {
  beforeEach(() => {
    mocked.requestDocumentResolveOpenTarget.mockReset()
    mocked.requestPrepareOpenPathInCurrentWindow.mockReset()
    mocked.requestDocumentOpenPath.mockReset()
    mocked.requestDocumentOpenPathInCurrentWindow.mockReset()
    mocked.requestCurrentWindowOpenPreparation.mockReset()
    mocked.showInfoMessage.mockReset()
    mocked.showErrorMessage.mockReset()
    mocked.notifySourceSessionChanged.mockReset()
    mocked.promptOpenModeChoice.mockReset()
    mocked.promptSaveChoice.mockReset()

    mocked.requestDocumentResolveOpenTarget.mockResolvedValue({
      ok: true,
      decision: 'needs-open-mode-choice',
      path: '/tmp/next.md',
    })
    mocked.requestPrepareOpenPathInCurrentWindow.mockResolvedValue({
      ok: true,
      decision: 'needs-save-choice',
      path: '/tmp/next.md',
      sourceSessionId: 'session-current',
      sourceRevision: 7,
    })
    mocked.requestDocumentOpenPath.mockResolvedValue({
      ok: true,
      reason: 'opened',
    })
    mocked.requestDocumentOpenPathInCurrentWindow.mockResolvedValue({
      ok: true,
      reason: 'opened-in-current-window',
    })
    mocked.requestCurrentWindowOpenPreparation.mockResolvedValue({
      ok: true,
      reason: 'prepared',
      snapshot: {
        sessionId: 'session-current',
        revision: 7,
        dirty: true,
        displayPath: '/tmp/current.md',
      },
    })
    mocked.promptOpenModeChoice.mockResolvedValue('current-window')
    mocked.promptSaveChoice.mockResolvedValue('save-before-switch')
    mocked.controllerFactory = controllerModule.createFileManagerOpenDecisionController
  })

  it('默认打开模式选择弹窗在真正取消时必须返回 cancel，且保留三选一 footer', async () => {
    const { createDefaultPromptOpenModeChoice } = controllerModule
    let modalConfig = null
    const registerDestroyer = vi.fn()
    const prompt = createDefaultPromptOpenModeChoice(value => value, {
      createModal: vi.fn((config) => {
        modalConfig = config
        return {
          destroy: vi.fn(),
        }
      }),
    })

    const resultPromise = prompt({
      setActiveDialogDestroyer: registerDestroyer,
    })

    expect(Array.isArray(modalConfig?.footer?.children)).toBe(true)
    expect(modalConfig.footer.children).toHaveLength(3)
    expect(registerDestroyer).toHaveBeenCalledWith(expect.any(Function))

    modalConfig.onCancel()

    await expect(resultPromise).resolves.toBe('cancel')
  })

  it('默认保存选择弹窗在真正取消时必须返回 cancel，且保留三选一 footer', async () => {
    const { createDefaultPromptSaveChoice } = controllerModule
    let modalConfig = null
    const registerDestroyer = vi.fn()
    const prompt = createDefaultPromptSaveChoice(value => value, {
      createModal: vi.fn((config) => {
        modalConfig = config
        return {
          destroy: vi.fn(),
        }
      }),
    })

    const resultPromise = prompt({
      setActiveDialogDestroyer: registerDestroyer,
    })

    expect(Array.isArray(modalConfig?.footer?.children)).toBe(true)
    expect(modalConfig.footer.children).toHaveLength(3)
    expect(registerDestroyer).toHaveBeenCalledWith(expect.any(Function))

    modalConfig.onCancel()

    await expect(resultPromise).resolves.toBe('cancel')
  })

  it('默认打开模式选择弹窗注册的 destroyer 被宿主触发时，应主动销毁弹窗并结束为 cancel', async () => {
    const { createDefaultPromptOpenModeChoice } = controllerModule
    const modalDestroy = vi.fn()
    let registeredDestroyer = null
    const prompt = createDefaultPromptOpenModeChoice(value => value, {
      createModal: vi.fn(() => ({
        destroy: modalDestroy,
      })),
    })

    const resultPromise = prompt({
      setActiveDialogDestroyer: (destroyer) => {
        registeredDestroyer = destroyer
      },
    })

    expect(typeof registeredDestroyer).toBe('function')

    registeredDestroyer()

    await expect(resultPromise).resolves.toBe('cancel')
    expect(modalDestroy).toHaveBeenCalledTimes(1)
  })

  it('默认保存选择弹窗注册的 destroyer 被宿主触发时，应主动销毁弹窗并结束为 cancel', async () => {
    const { createDefaultPromptSaveChoice } = controllerModule
    const modalDestroy = vi.fn()
    let registeredDestroyer = null
    const prompt = createDefaultPromptSaveChoice(value => value, {
      createModal: vi.fn(() => ({
        destroy: modalDestroy,
      })),
    })

    const resultPromise = prompt({
      setActiveDialogDestroyer: (destroyer) => {
        registeredDestroyer = destroyer
      },
    })

    expect(typeof registeredDestroyer).toBe('function')

    registeredDestroyer()

    await expect(resultPromise).resolves.toBe('cancel')
    expect(modalDestroy).toHaveBeenCalledTimes(1)
  })

  it('目标已在其他窗口打开时，必须在 open-choice 前直接结束', async () => {
    mocked.requestDocumentResolveOpenTarget.mockResolvedValue({
      ok: true,
      decision: 'focused-existing-window',
      path: '/tmp/next.md',
    })
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      entrySource: 'recent',
      trigger: 'user',
    })

    expect(result).toEqual({
      ok: true,
      decision: 'focused-existing-window',
      path: '/tmp/next.md',
      stageList: ['target-preflight'],
    })
    expect(mocked.promptOpenModeChoice).not.toHaveBeenCalled()
    expect(mocked.promptSaveChoice).not.toHaveBeenCalled()
    expect(mocked.requestCurrentWindowOpenPreparation).not.toHaveBeenCalled()
    expect(mocked.showInfoMessage).toHaveBeenCalledWith('message.fileAlreadyOpenedInOtherWindow')
  })

  it('命中 noop-current-file 时，也必须先经过目标预判阶段再结束', async () => {
    mocked.requestDocumentResolveOpenTarget.mockResolvedValue({
      ok: true,
      decision: 'noop-current-file',
      path: '/tmp/current.md',
    })
    const controller = createController()

    const result = await controller.openDocument('/tmp/current.md')

    expect(result).toEqual({
      ok: true,
      decision: 'noop-current-file',
      path: '/tmp/current.md',
      stageList: ['target-preflight'],
    })
    expect(mocked.promptOpenModeChoice).not.toHaveBeenCalled()
    expect(mocked.requestPrepareOpenPathInCurrentWindow).not.toHaveBeenCalled()
  })

  it('点击其他 markdown 时，应先过目标预判和当前窗口预判，再在 dirty 场景下追加 save-choice', async () => {
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
    })

    expect(result.stageList).toEqual([
      'target-preflight',
      'open-choice',
      'current-window-preflight',
      'save-choice',
      'dispatch',
    ])
    expect(mocked.requestDocumentResolveOpenTarget).toHaveBeenCalledWith('/tmp/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
    })
    expect(mocked.requestCurrentWindowOpenPreparation).toHaveBeenCalledTimes(1)
    expect(mocked.requestPrepareOpenPathInCurrentWindow).toHaveBeenCalledWith('/tmp/next.md', {
      entrySource: 'file-manager',
      sourceSessionId: 'session-current',
      sourceRevision: 7,
      trigger: 'user',
    })
    expect(mocked.requestDocumentOpenPathInCurrentWindow).toHaveBeenCalledWith('/tmp/next.md', {
      entrySource: 'file-manager',
      expectedRevision: 7,
      expectedSessionId: 'session-current',
      switchPolicy: 'save-before-switch',
      trigger: 'user',
    })
  })

  it('选择新窗口打开时不应进入当前窗口预判与 save-choice', async () => {
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      openMode: 'new-window',
      entrySource: 'recent',
      trigger: 'user',
    })

    expect(result.stageList).toEqual(['target-preflight', 'open-choice', 'dispatch'])
    expect(mocked.requestCurrentWindowOpenPreparation).not.toHaveBeenCalled()
    expect(mocked.requestPrepareOpenPathInCurrentWindow).not.toHaveBeenCalled()
    expect(mocked.promptSaveChoice).not.toHaveBeenCalled()
    expect(mocked.requestDocumentOpenPath).toHaveBeenCalledWith('/tmp/next.md', {
      entrySource: 'recent',
      trigger: 'user',
    })
  })

  it('显式传入 current-window 时应跳过打开方式选择，但保留当前窗口预判与 save-choice', async () => {
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      openMode: 'current-window',
      entrySource: 'file-manager',
      trigger: 'user',
    })

    expect(result.stageList).toEqual([
      'target-preflight',
      'open-choice',
      'current-window-preflight',
      'save-choice',
      'dispatch',
    ])
    expect(mocked.promptOpenModeChoice).not.toHaveBeenCalled()
    expect(mocked.requestCurrentWindowOpenPreparation).toHaveBeenCalledTimes(1)
    expect(mocked.promptSaveChoice).toHaveBeenCalledTimes(1)
    expect(mocked.requestDocumentOpenPathInCurrentWindow).toHaveBeenCalledWith('/tmp/next.md', {
      entrySource: 'file-manager',
      expectedRevision: 7,
      expectedSessionId: 'session-current',
      switchPolicy: 'save-before-switch',
      trigger: 'user',
    })
  })

  it('新窗口分支底层返回兼容 false 时，应原样保留 false 结果', async () => {
    mocked.requestDocumentOpenPath.mockResolvedValue(false)
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      openMode: 'new-window',
    })

    expect(result).toBe(false)
  })

  it('当前窗口切换预判返回 ready-to-switch 时，必须跳过 save-choice 并使用 direct-switch', async () => {
    mocked.requestPrepareOpenPathInCurrentWindow.mockResolvedValue({
      ok: true,
      decision: 'ready-to-switch',
      path: '/tmp/next.md',
      sourceSessionId: 'session-current',
      sourceRevision: 7,
    })
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
    })

    expect(result.stageList).toEqual([
      'target-preflight',
      'open-choice',
      'current-window-preflight',
      'dispatch',
    ])
    expect(mocked.promptSaveChoice).not.toHaveBeenCalled()
    expect(mocked.requestDocumentOpenPathInCurrentWindow).toHaveBeenCalledWith('/tmp/next.md', {
      entrySource: 'file-manager',
      expectedRevision: 7,
      expectedSessionId: 'session-current',
      switchPolicy: 'direct-switch',
      trigger: 'user',
    })
  })

  it('当前窗口切换预判若发现目标已在其他窗口打开，必须在 save-choice 前直接结束', async () => {
    mocked.requestPrepareOpenPathInCurrentWindow.mockResolvedValue({
      ok: true,
      decision: 'focused-existing-window',
      path: '/tmp/next.md',
      sourceSessionId: 'session-current',
      sourceRevision: 7,
    })
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
    })

    expect(result).toEqual({
      ok: true,
      decision: 'focused-existing-window',
      path: '/tmp/next.md',
      sourceRevision: 7,
      sourceSessionId: 'session-current',
      stageList: ['target-preflight', 'open-choice', 'current-window-preflight'],
    })
    expect(mocked.promptSaveChoice).not.toHaveBeenCalled()
    expect(mocked.requestDocumentOpenPathInCurrentWindow).not.toHaveBeenCalled()
    expect(mocked.showInfoMessage).toHaveBeenCalledWith('message.fileAlreadyOpenedInOtherWindow')
  })

  it('打开模式选择取消时应返回 open-cancelled，且不发起任何打开调度', async () => {
    mocked.promptOpenModeChoice.mockResolvedValue('cancel')
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md')

    expect(result).toEqual({
      ok: false,
      reason: 'open-cancelled',
      stageList: ['target-preflight', 'open-choice'],
    })
    expect(mocked.requestCurrentWindowOpenPreparation).not.toHaveBeenCalled()
    expect(mocked.requestDocumentOpenPath).not.toHaveBeenCalled()
  })

  it('保存选择取消时应返回 open-cancelled，且不发起当前窗口切换', async () => {
    mocked.promptSaveChoice.mockResolvedValue('cancel')
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md')

    expect(result).toEqual({
      ok: false,
      reason: 'open-cancelled',
      stageList: ['target-preflight', 'open-choice', 'current-window-preflight', 'save-choice'],
    })
    expect(mocked.requestDocumentOpenPathInCurrentWindow).not.toHaveBeenCalled()
  })

  it('execute 返回 source-session-changed 时，必须中止流程并提示用户重新发起打开', async () => {
    mocked.requestPrepareOpenPathInCurrentWindow.mockResolvedValue({
      ok: true,
      decision: 'ready-to-switch',
      path: '/tmp/next.md',
      sourceSessionId: 'session-current',
      sourceRevision: 7,
    })
    mocked.requestDocumentOpenPathInCurrentWindow.mockResolvedValue({
      ok: false,
      reason: 'source-session-changed',
      path: '/tmp/next.md',
    })
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'source-session-changed',
      path: '/tmp/next.md',
      stageList: ['target-preflight', 'open-choice', 'current-window-preflight', 'dispatch'],
    })
    expect(mocked.promptSaveChoice).not.toHaveBeenCalled()
    expect(mocked.notifySourceSessionChanged).toHaveBeenCalledTimes(1)
  })

  it('交互在 open-choice 等待期间失效后，即使旧弹窗继续返回，也不得继续 dispatch', async () => {
    const openChoiceDeferred = createDeferred()
    const controller = createController({
      promptOpenModeChoice: vi.fn(() => openChoiceDeferred.promise),
    })
    let active = true

    const resultPromise = controller.openDocument('/tmp/next.md', {
      entrySource: 'recent',
      trigger: 'user',
      isInteractionActive: () => active,
      setActiveDialogDestroyer: vi.fn(),
    })

    await Promise.resolve()
    active = false
    openChoiceDeferred.resolve('new-window')

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: 'request-invalidated',
      path: '/tmp/next.md',
      stageList: ['target-preflight', 'open-choice'],
    })
    expect(mocked.requestDocumentOpenPath).not.toHaveBeenCalled()
    expect(mocked.requestCurrentWindowOpenPreparation).not.toHaveBeenCalled()
    expect(mocked.requestDocumentOpenPathInCurrentWindow).not.toHaveBeenCalled()
  })

  it('交互在当前窗口预判等待期间失效后，即使旧 preflight 继续返回，也不得进入 save-choice 或 dispatch', async () => {
    const currentWindowPreflightDeferred = createDeferred()
    mocked.requestPrepareOpenPathInCurrentWindow.mockImplementation(() => currentWindowPreflightDeferred.promise)
    const controller = createController()
    let active = true

    const resultPromise = controller.openDocument('/tmp/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
      isInteractionActive: () => active,
      setActiveDialogDestroyer: vi.fn(),
    })

    await Promise.resolve()
    await Promise.resolve()
    active = false
    currentWindowPreflightDeferred.resolve({
      ok: true,
      decision: 'needs-save-choice',
      path: '/tmp/next.md',
      sourceSessionId: 'session-current',
      sourceRevision: 7,
    })

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: 'request-invalidated',
      path: '/tmp/next.md',
      stageList: ['target-preflight', 'open-choice', 'current-window-preflight'],
    })
    expect(mocked.promptSaveChoice).not.toHaveBeenCalled()
    expect(mocked.requestDocumentOpenPathInCurrentWindow).not.toHaveBeenCalled()
  })

  it('交互在 save-choice 等待期间失效后，即使旧选择继续返回，也不得继续当前窗口 dispatch', async () => {
    const saveChoiceDeferred = createDeferred()
    const promptSaveChoice = vi.fn(() => saveChoiceDeferred.promise)
    const controller = createController({
      promptSaveChoice,
    })
    let active = true

    const resultPromise = controller.openDocument('/tmp/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
      isInteractionActive: () => active,
      setActiveDialogDestroyer: vi.fn(),
    })

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(promptSaveChoice).toHaveBeenCalledTimes(1)
    active = false
    saveChoiceDeferred.resolve('discard-switch')

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: 'request-invalidated',
      path: '/tmp/next.md',
      stageList: ['target-preflight', 'open-choice', 'current-window-preflight', 'save-choice'],
    })
    expect(mocked.requestDocumentOpenPathInCurrentWindow).not.toHaveBeenCalled()
  })

  it('当前窗口切换返回 save-before-switch-failed 时，必须提示用户失败原因', async () => {
    mocked.requestDocumentOpenPathInCurrentWindow.mockResolvedValue({
      ok: false,
      reason: 'save-before-switch-failed',
    })
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'save-before-switch-failed',
      stageList: ['target-preflight', 'open-choice', 'current-window-preflight', 'save-choice', 'dispatch'],
    })
    expect(mocked.showErrorMessage).toHaveBeenCalledWith('message.fileManagerSaveBeforeSwitchFailed')
  })

  it('当前窗口切换返回 open-current-window-switch-failed 时，必须提示用户失败原因', async () => {
    mocked.requestPrepareOpenPathInCurrentWindow.mockResolvedValue({
      ok: true,
      decision: 'ready-to-switch',
      path: '/tmp/next.md',
      sourceSessionId: 'session-current',
      sourceRevision: 7,
    })
    mocked.requestDocumentOpenPathInCurrentWindow.mockResolvedValue({
      ok: false,
      reason: 'open-current-window-switch-failed',
    })
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      entrySource: 'file-manager',
      trigger: 'user',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-current-window-switch-failed',
      stageList: ['target-preflight', 'open-choice', 'current-window-preflight', 'dispatch'],
    })
    expect(mocked.showErrorMessage).toHaveBeenCalledWith('message.fileManagerOpenCurrentWindowFailed')
  })

  it('默认 notifySourceSessionChanged 必须通过 i18n key 输出 warning', async () => {
    vi.resetModules()
    const warningMock = vi.fn()
    vi.doMock('ant-design-vue', () => ({
      Button: {},
      Modal: {
        confirm: vi.fn(),
      },
      message: {
        warning: warningMock,
        info: vi.fn(),
        error: vi.fn(),
      },
    }))

    try {
      const { createFileManagerOpenDecisionController } = await import('../fileManagerOpenDecisionController.js')
      const controller = createFileManagerOpenDecisionController({
        t: (value) => {
          if (value === 'message.fileManagerSourceSessionChanged') {
            return 'The current document state has changed. Please try opening the file again.'
          }
          return value
        },
        requestDocumentResolveOpenTarget: async () => ({
          ok: true,
          decision: 'needs-open-mode-choice',
          path: '/tmp/next.md',
        }),
        requestPrepareOpenPathInCurrentWindow: async () => ({
          ok: true,
          decision: 'ready-to-switch',
          path: '/tmp/next.md',
          sourceSessionId: 'session-current',
          sourceRevision: 7,
        }),
        requestCurrentWindowOpenPreparation: async () => ({
          ok: true,
          reason: 'prepared',
          snapshot: {
            sessionId: 'session-current',
            revision: 7,
            dirty: false,
            displayPath: '/tmp/current.md',
          },
        }),
        promptOpenModeChoice: async () => 'current-window',
        requestDocumentOpenPath: async () => ({
          ok: true,
          reason: 'opened',
        }),
        requestDocumentOpenPathInCurrentWindow: async () => ({
          ok: false,
          reason: 'source-session-changed',
          path: '/tmp/next.md',
        }),
      })

      const result = await controller.openDocument('/tmp/next.md', {
        entrySource: 'file-manager',
        trigger: 'user',
      })

      expect(result).toEqual({
        ok: false,
        reason: 'source-session-changed',
        path: '/tmp/next.md',
        stageList: ['target-preflight', 'open-choice', 'current-window-preflight', 'dispatch'],
      })
      expect(warningMock).toHaveBeenCalledTimes(1)
      expect(warningMock).toHaveBeenCalledWith('The current document state has changed. Please try opening the file again.')
    } finally {
      vi.doUnmock('ant-design-vue')
      vi.resetModules()
    }
  })
})
