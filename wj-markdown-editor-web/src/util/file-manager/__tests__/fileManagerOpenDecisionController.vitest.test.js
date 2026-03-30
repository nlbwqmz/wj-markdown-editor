import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  requestDocumentOpenPath: vi.fn(),
  requestDocumentOpenPathInCurrentWindow: vi.fn(),
  showInfoMessage: vi.fn(),
  promptOpenModeChoice: vi.fn(),
  promptSaveChoice: vi.fn(),
}))

function createController(options = {}) {
  return mocked.controllerFactory({
    t: value => value,
    requestDocumentOpenPath: mocked.requestDocumentOpenPath,
    requestDocumentOpenPathInCurrentWindow: mocked.requestDocumentOpenPathInCurrentWindow,
    showInfoMessage: mocked.showInfoMessage,
    promptOpenModeChoice: mocked.promptOpenModeChoice,
    promptSaveChoice: mocked.promptSaveChoice,
    ...options,
  })
}

describe('fileManagerOpenDecisionController', () => {
  beforeEach(async () => {
    mocked.requestDocumentOpenPath.mockReset()
    mocked.requestDocumentOpenPathInCurrentWindow.mockReset()
    mocked.showInfoMessage.mockReset()
    mocked.promptOpenModeChoice.mockReset()
    mocked.promptSaveChoice.mockReset()
    mocked.requestDocumentOpenPath.mockResolvedValue({
      ok: true,
      reason: 'opened',
    })
    mocked.requestDocumentOpenPathInCurrentWindow.mockResolvedValue({
      ok: true,
      reason: 'opened-in-current-window',
    })
    mocked.promptOpenModeChoice.mockResolvedValue('current-window')
    mocked.promptSaveChoice.mockResolvedValue('save-before-switch')

    const { createFileManagerOpenDecisionController } = await import('../fileManagerOpenDecisionController.js')
    mocked.controllerFactory = createFileManagerOpenDecisionController
  })

  it('默认打开模式选择弹窗在真正取消时必须返回 cancel，且保留三选一 footer', async () => {
    const { createDefaultPromptOpenModeChoice } = await import('../fileManagerOpenDecisionController.js')
    let modalConfig = null
    const prompt = createDefaultPromptOpenModeChoice(value => value, {
      createModal: vi.fn((config) => {
        modalConfig = config
        return {
          destroy: vi.fn(),
        }
      }),
    })

    const resultPromise = prompt()

    expect(Array.isArray(modalConfig?.footer?.children)).toBe(true)
    expect(modalConfig.footer.children).toHaveLength(3)

    modalConfig.onCancel()

    await expect(resultPromise).resolves.toBe('cancel')
  })

  it('默认保存选择弹窗在真正取消时必须返回 cancel，且保留三选一 footer', async () => {
    const { createDefaultPromptSaveChoice } = await import('../fileManagerOpenDecisionController.js')
    let modalConfig = null
    const prompt = createDefaultPromptSaveChoice(value => value, {
      createModal: vi.fn((config) => {
        modalConfig = config
        return {
          destroy: vi.fn(),
        }
      }),
    })

    const resultPromise = prompt()

    expect(Array.isArray(modalConfig?.footer?.children)).toBe(true)
    expect(modalConfig.footer.children).toHaveLength(3)

    modalConfig.onCancel()

    await expect(resultPromise).resolves.toBe('cancel')
  })

  it('点击其他 markdown 时应先返回 open-choice，再在 dirty 文档下追加 save-choice', async () => {
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      currentPath: '/tmp/current.md',
      isDirty: true,
    })

    expect(result.stageList).toEqual(['open-choice', 'save-choice', 'dispatch'])
  })

  it('选择新窗口打开时不应进入 save-choice，即使当前文档未保存', async () => {
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      currentPath: '/tmp/current.md',
      isDirty: true,
      openMode: 'new-window',
    })

    expect(result.stageList).toEqual(['open-choice', 'dispatch'])
    expect(mocked.requestDocumentOpenPathInCurrentWindow).not.toHaveBeenCalled()
  })

  it('目标文件已在其他窗口打开时应给出统一提示', async () => {
    mocked.requestDocumentOpenPathInCurrentWindow.mockResolvedValue({
      ok: true,
      reason: 'focused-existing-window',
    })
    const controller = createController()

    await controller.openDocument('/tmp/next.md', {
      currentPath: '/tmp/current.md',
      isDirty: false,
    })

    expect(mocked.showInfoMessage).toHaveBeenCalledWith('message.fileAlreadyOpenedInOtherWindow')
  })

  it('当前文件重复打开时应直接返回 noop-current-file，不发起任何调度', async () => {
    const controller = createController()

    const result = await controller.openDocument('/tmp/current.md', {
      currentPath: '/tmp/current.md',
      isDirty: true,
    })

    expect(result).toEqual({
      ok: true,
      reason: 'noop-current-file',
      stageList: [],
    })
    expect(mocked.requestDocumentOpenPath).not.toHaveBeenCalled()
    expect(mocked.requestDocumentOpenPathInCurrentWindow).not.toHaveBeenCalled()
  })

  it('打开模式选择取消时应返回 open-cancelled，且不发起任何打开调度', async () => {
    mocked.promptOpenModeChoice.mockResolvedValue('cancel')
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      currentPath: '/tmp/current.md',
      isDirty: false,
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-cancelled',
      stageList: ['open-choice'],
    })
    expect(mocked.requestDocumentOpenPath).not.toHaveBeenCalled()
    expect(mocked.requestDocumentOpenPathInCurrentWindow).not.toHaveBeenCalled()
  })

  it('保存选择取消时应返回 open-cancelled，且不发起当前窗口切换', async () => {
    mocked.promptSaveChoice.mockResolvedValue('cancel')
    const controller = createController()

    const result = await controller.openDocument('/tmp/next.md', {
      currentPath: '/tmp/current.md',
      isDirty: true,
    })

    expect(result).toEqual({
      ok: false,
      reason: 'open-cancelled',
      stageList: ['open-choice', 'save-choice'],
    })
    expect(mocked.requestDocumentOpenPathInCurrentWindow).not.toHaveBeenCalled()
  })
})
