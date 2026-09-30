import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFileManagerPanelWidthPersistenceController } from '../fileManagerPanelWidthPersistenceController.js'

// 该模块依赖 homeViewFilePanelLayoutUtil，会间接引入 split-grid；这里替换掉，避免真实布局依赖。
vi.mock('split-grid', () => ({
  default() {
    return {
      destroy: vi.fn(),
    }
  },
}))

function createController(overrides = {}) {
  const sendConfigMutationRequest = vi.fn().mockResolvedValue({ ok: true })
  const showWarningMessage = vi.fn()
  const applyPersistedWidth = vi.fn()
  const controller = createFileManagerPanelWidthPersistenceController({
    sendConfigMutationRequest,
    showWarningMessage,
    applyPersistedWidth,
    ...overrides,
  })

  return {
    controller,
    sendConfigMutationRequest,
    showWarningMessage,
    applyPersistedWidth,
  }
}

describe('fileManagerPanelWidthPersistenceController', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('持久化成功后应发送 fileManagerWidth 单路径 set 并同步 store 宽度', async () => {
    const { controller, sendConfigMutationRequest, showWarningMessage, applyPersistedWidth } = createController()

    const result = await controller.persistFileManagerPanelWidth(320)

    expect(sendConfigMutationRequest).toHaveBeenCalledWith({
      operations: [
        {
          type: 'set',
          path: ['fileManagerWidth'],
          value: 320,
        },
      ],
    })
    expect(showWarningMessage).not.toHaveBeenCalled()
    expect(applyPersistedWidth).toHaveBeenCalledWith(320)
    expect(result).toEqual({ ok: true })
  })

  it('持久化前应把宽度四舍五入并限制在 220 到 420 之间', async () => {
    const { controller, sendConfigMutationRequest, applyPersistedWidth } = createController()

    await controller.persistFileManagerPanelWidth(320.6)
    await controller.persistFileManagerPanelWidth(999)
    await controller.persistFileManagerPanelWidth(10)
    await controller.persistFileManagerPanelWidth(Number.NaN)

    expect(sendConfigMutationRequest.mock.calls.map(([request]) => request.operations[0].value)).toEqual([321, 420, 220, 280])
    expect(applyPersistedWidth.mock.calls.map(([width]) => width)).toEqual([321, 420, 220, 280])
  })

  it('持久化失败时应提示失败 messageKey 且不更新 store 宽度', async () => {
    const { controller, showWarningMessage, applyPersistedWidth } = createController({
      sendConfigMutationRequest: vi.fn().mockResolvedValue({
        ok: false,
        messageKey: 'message.configWriteFailed',
        reason: 'config-write-failed',
      }),
    })

    const result = await controller.persistFileManagerPanelWidth(300)

    expect(showWarningMessage).toHaveBeenCalledWith('message.configWriteFailed')
    expect(applyPersistedWidth).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      messageKey: 'message.configWriteFailed',
      reason: 'config-write-failed',
    })
  })

  it('iPC 抛异常时应兜底提示配置写入失败', async () => {
    const { controller, showWarningMessage, applyPersistedWidth } = createController({
      sendConfigMutationRequest: vi.fn().mockRejectedValue(new Error('ipc-failed')),
    })

    const result = await controller.persistFileManagerPanelWidth(300)

    expect(showWarningMessage).toHaveBeenCalledWith('message.configWriteFailed')
    expect(applyPersistedWidth).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      messageKey: 'message.configWriteFailed',
      reason: 'config-update-transport-failed',
    })
  })

  it('已持久化值与目标值相同时应短路，避免无谓写盘', async () => {
    const { controller, sendConfigMutationRequest, showWarningMessage, applyPersistedWidth } = createController({
      getPersistedWidth: () => 320,
    })

    const result = await controller.persistFileManagerPanelWidth(320)

    expect(sendConfigMutationRequest).not.toHaveBeenCalled()
    expect(showWarningMessage).not.toHaveBeenCalled()
    expect(applyPersistedWidth).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: 'unchanged',
    })
  })

  it('已持久化值无法解析时不得按默认宽度误判跳过写盘', async () => {
    const { controller, sendConfigMutationRequest } = createController({
      getPersistedWidth: () => undefined,
    })

    await controller.persistFileManagerPanelWidth(280)

    expect(sendConfigMutationRequest).toHaveBeenCalledTimes(1)
    expect(sendConfigMutationRequest.mock.calls[0][0].operations[0].value).toBe(280)
  })

  it('已持久化值应先按同样的取整与钳制规则归一化后再比较', async () => {
    const { controller, sendConfigMutationRequest } = createController({
      getPersistedWidth: () => 320.4,
    })

    const result = await controller.persistFileManagerPanelWidth(320)

    expect(sendConfigMutationRequest).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: 'unchanged',
    })
  })

  it('写盘失败后同一宽度再次提交应继续重试', async () => {
    const sendConfigMutationRequest = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        messageKey: 'message.configWriteFailed',
        reason: 'config-write-failed',
      })
      .mockResolvedValueOnce({ ok: true })
    const { controller, applyPersistedWidth } = createController({
      sendConfigMutationRequest,
      getPersistedWidth: () => 280,
    })

    const firstResult = await controller.persistFileManagerPanelWidth(320)
    const secondResult = await controller.persistFileManagerPanelWidth(320)

    expect(sendConfigMutationRequest).toHaveBeenCalledTimes(2)
    expect(firstResult.ok).toBe(false)
    expect(secondResult).toEqual({ ok: true })
    expect(applyPersistedWidth).toHaveBeenCalledWith(320)
  })
})
