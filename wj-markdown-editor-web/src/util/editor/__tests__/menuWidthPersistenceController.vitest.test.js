import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clampMenuWidth,
  createMenuWidthPersistenceController,
  MENU_WIDTH_DEFAULT,
  MENU_WIDTH_MAX,
  MENU_WIDTH_MIN,
  resolveMenuWidthUpperBound,
} from '../menuWidthPersistenceController.js'

function createController(overrides = {}) {
  const sendConfigMutationRequest = vi.fn().mockResolvedValue({ ok: true })
  const showWarningMessage = vi.fn()
  const applyPersistedWidth = vi.fn()
  const controller = createMenuWidthPersistenceController({
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

describe('menuWidthPersistenceController', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('大纲宽度常量应符合既定范围', () => {
    expect(MENU_WIDTH_MIN).toBe(200)
    expect(MENU_WIDTH_MAX).toBe(2000)
    expect(MENU_WIDTH_DEFAULT).toBe(200)
  })

  it('clampMenuWidth 应把宽度钳制在 200 到 2000 之间，无法解析时回退默认值', () => {
    expect(clampMenuWidth(320)).toBe(320)
    expect(clampMenuWidth(10)).toBe(200)
    expect(clampMenuWidth(9999)).toBe(2000)
    expect(clampMenuWidth(Number.NaN)).toBe(200)
    expect(clampMenuWidth(undefined)).toBe(200)
    expect(clampMenuWidth('320')).toBe(320)
  })

  it('resolveMenuWidthUpperBound 应为其他内容列预留最小宽度，容器宽度不可用时退回设计上限', () => {
    // 容器 1200 时上限为 1200 - (2 + 200 * 2) = 798。
    expect(resolveMenuWidthUpperBound(1200)).toBe(798)
    // 容器过窄时下限收敛到 MENU_WIDTH_MIN。
    expect(resolveMenuWidthUpperBound(300)).toBe(MENU_WIDTH_MIN)
    // 容器宽度不可用时退回设计上限。
    expect(resolveMenuWidthUpperBound(Number.NaN)).toBe(MENU_WIDTH_MAX)
    expect(resolveMenuWidthUpperBound(undefined)).toBe(MENU_WIDTH_MAX)
    // keep-alive 失活时 clientWidth 为 0，同样按不可用处理，避免把宽度错误钳制到最小值。
    expect(resolveMenuWidthUpperBound(0)).toBe(MENU_WIDTH_MAX)
  })

  it('持久化成功后应发送 menuWidth 单路径 set 并同步 store 宽度', async () => {
    const { controller, sendConfigMutationRequest, showWarningMessage, applyPersistedWidth } = createController()

    const result = await controller.persistMenuWidth(320)

    expect(sendConfigMutationRequest).toHaveBeenCalledWith({
      operations: [
        {
          type: 'set',
          path: ['menuWidth'],
          value: 320,
        },
      ],
    })
    expect(showWarningMessage).not.toHaveBeenCalled()
    expect(applyPersistedWidth).toHaveBeenCalledWith(320)
    expect(result).toEqual({ ok: true })
  })

  it('持久化前应把宽度四舍五入并限制在 200 到 2000 之间', async () => {
    const { controller, sendConfigMutationRequest, applyPersistedWidth } = createController()

    await controller.persistMenuWidth(320.6)
    await controller.persistMenuWidth(9999)
    await controller.persistMenuWidth(10)
    await controller.persistMenuWidth(Number.NaN)

    expect(sendConfigMutationRequest.mock.calls.map(([request]) => request.operations[0].value)).toEqual([321, 2000, 200, 200])
    expect(applyPersistedWidth.mock.calls.map(([width]) => width)).toEqual([321, 2000, 200, 200])
  })

  it('持久化失败时应提示失败 messageKey 且不更新 store 宽度', async () => {
    const { controller, showWarningMessage, applyPersistedWidth } = createController({
      sendConfigMutationRequest: vi.fn().mockResolvedValue({
        ok: false,
        messageKey: 'message.configWriteFailed',
        reason: 'config-write-failed',
      }),
    })

    const result = await controller.persistMenuWidth(300)

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

    const result = await controller.persistMenuWidth(300)

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

    const result = await controller.persistMenuWidth(320)

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

    await controller.persistMenuWidth(200)

    expect(sendConfigMutationRequest).toHaveBeenCalledTimes(1)
    expect(sendConfigMutationRequest.mock.calls[0][0].operations[0].value).toBe(200)
  })

  it('已持久化值应先按同样的取整与钳制规则归一化后再比较', async () => {
    const { controller, sendConfigMutationRequest } = createController({
      getPersistedWidth: () => 320.4,
    })

    const result = await controller.persistMenuWidth(320)

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
      getPersistedWidth: () => 200,
    })

    const firstResult = await controller.persistMenuWidth(320)
    const secondResult = await controller.persistMenuWidth(320)

    expect(sendConfigMutationRequest).toHaveBeenCalledTimes(2)
    expect(firstResult.ok).toBe(false)
    expect(secondResult).toEqual({ ok: true })
    expect(applyPersistedWidth).toHaveBeenCalledWith(320)
  })
})
