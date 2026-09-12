import { beforeEach, describe, expect, it, vi } from 'vitest'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolveInner, rejectInner) => {
    resolve = resolveInner
    reject = rejectInner
  })
  return {
    promise,
    reject,
    resolve,
  }
}

const {
  channelSend,
  createVNodeMock,
  hMock,
  modalConfirm,
  requestDocumentSaveAndClose,
  tMock,
} = vi.hoisted(() => ({
  channelSend: vi.fn(),
  createVNodeMock: vi.fn((type, props, children) => ({
    type,
    props,
    children,
  })),
  hMock: vi.fn((type, props, children) => ({
    type,
    props,
    children,
  })),
  modalConfirm: vi.fn(),
  requestDocumentSaveAndClose: vi.fn(),
  tMock: vi.fn(key => ({
    'prompt': 'Prompt',
    'cancelText': 'Cancel',
    'closeModal.closePrompt': 'There are unsaved changes.',
    'closeModal.openSetting': 'Open settings',
    'closeModal.saveAndExit': 'Save and exit',
    'closeModal.directExit': 'Exit directly',
  }[key] || key)),
}))

vi.mock('@ant-design/icons-vue', () => ({
  ExclamationCircleOutlined: 'ExclamationCircleOutlined',
}))

vi.mock('ant-design-vue', () => ({
  Button: 'Button',
  Modal: {
    confirm: modalConfirm,
  },
}))

vi.mock('vue', () => ({
  createVNode: createVNodeMock,
  h: hMock,
}))

vi.mock('@/i18n/index.js', () => ({
  default: {
    global: {
      t: tMock,
    },
  },
}))

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: channelSend,
  },
}))

vi.mock('@/util/document-session/rendererDocumentCommandUtil.js', () => ({
  requestDocumentSaveAndClose,
}))

const {
  destroyClosePromptModal,
  syncClosePromptSnapshot,
} = await import('../closePromptSyncService.js')

describe('closePromptSyncService', () => {
  beforeEach(() => {
    destroyClosePromptModal()
    modalConfirm.mockReset()
    channelSend.mockReset()
    channelSend.mockResolvedValue(undefined)
    requestDocumentSaveAndClose.mockReset()
    requestDocumentSaveAndClose.mockResolvedValue(true)
  })

  it('关闭弹窗应展示保存并退出与直接退出，并把按钮动作发送到对应命令', async () => {
    const modalInstance = {
      destroy: vi.fn(),
      update: vi.fn(),
    }
    modalConfirm.mockReturnValue(modalInstance)

    syncClosePromptSnapshot({
      fileName: 'demo.md',
      closePrompt: {
        visible: true,
        allowForceClose: true,
      },
    })

    const modalConfig = modalConfirm.mock.calls[0][0]
    const buttonList = modalConfig.footer.children

    // 四按钮必须单行展示：弹窗宽度需覆盖最长文案，footer 不允许换行。
    expect(modalConfig.width).toBe(560)
    expect(modalConfig.footer.props.style.flexWrap).toBe('nowrap')

    expect(buttonList.map(button => button.children())).toEqual([
      'Cancel',
      'Open settings',
      'Save and exit',
      'Exit directly',
    ])

    await buttonList[2].props.onClick()
    expect(requestDocumentSaveAndClose).toHaveBeenCalledTimes(1)
    expect(channelSend).not.toHaveBeenCalled()

    await buttonList[3].props.onClick()
    expect(channelSend).toHaveBeenCalledWith({
      event: 'document.confirm-force-close',
    })
  })

  it('保存并退出请求未结算时应合并重复点击，IPC 失败后保持弹窗并允许重试', async () => {
    const requestDeferred = createDeferred()
    const modalInstance = {
      destroy: vi.fn(),
      update: vi.fn(),
    }
    modalConfirm.mockReturnValue(modalInstance)
    requestDocumentSaveAndClose
      .mockReturnValueOnce(requestDeferred.promise)
      .mockResolvedValueOnce(true)

    syncClosePromptSnapshot({
      fileName: 'demo.md',
      closePrompt: {
        visible: true,
        allowForceClose: true,
      },
    })
    const saveAndExitButton = modalConfirm.mock.calls[0][0].footer.children[2]

    const firstRequest = saveAndExitButton.props.onClick()
    const repeatedRequest = saveAndExitButton.props.onClick()
    await Promise.resolve()

    expect(requestDocumentSaveAndClose).toHaveBeenCalledTimes(1)

    requestDeferred.reject(new Error('IPC failed'))
    await expect(firstRequest).resolves.toBeNull()
    await expect(repeatedRequest).resolves.toBeNull()
    expect(modalInstance.destroy).not.toHaveBeenCalled()
    expect(channelSend).not.toHaveBeenCalled()

    await saveAndExitButton.props.onClick()
    expect(requestDocumentSaveAndClose).toHaveBeenCalledTimes(2)
  })

  it('关闭弹窗的取消和设置按钮仍应清理关闭意图', async () => {
    const modalInstance = {
      destroy: vi.fn(),
      update: vi.fn(),
    }
    modalConfirm.mockReturnValue(modalInstance)

    syncClosePromptSnapshot({
      fileName: 'demo.md',
      closePrompt: {
        visible: true,
        allowForceClose: true,
      },
    })
    const buttonList = modalConfirm.mock.calls[0][0].footer.children

    await buttonList[0].props.onClick()
    await buttonList[1].props.onClick()

    expect(channelSend).toHaveBeenNthCalledWith(1, {
      event: 'document.cancel-close',
    })
    expect(channelSend).toHaveBeenNthCalledWith(2, {
      event: 'document.cancel-close',
    })
    expect(channelSend).toHaveBeenNthCalledWith(3, {
      event: 'open-setting',
    })
  })
})
