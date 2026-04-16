import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createBatchSetConfigPathRequest,
  createSetConfigPathRequest,
  sendConfigMutationRequest,
} from '../configMutationCommandUtil.js'

const mocked = vi.hoisted(() => ({
  send: vi.fn(),
}))

vi.mock('@/util/channel/channelUtil.js', () => ({
  default: {
    send: mocked.send,
  },
}))

describe('configMutationCommandUtil', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('createSetConfigPathRequest 必须把单字段更新封装为 set mutation request', () => {
    expect(createSetConfigPathRequest(['theme', 'global'], 'dark')).toEqual({
      operations: [
        {
          type: 'set',
          path: ['theme', 'global'],
          value: 'dark',
        },
      ],
    })
  })

  it('createBatchSetConfigPathRequest 必须把多个字段更新封装为 batch mutation request', () => {
    expect(createBatchSetConfigPathRequest([
      {
        path: ['fileManagerSort', 'field'],
        value: 'modifiedTime',
      },
      {
        path: ['fileManagerSort', 'direction'],
        value: 'desc',
      },
    ])).toEqual({
      operations: [
        {
          type: 'set',
          path: ['fileManagerSort', 'field'],
          value: 'modifiedTime',
        },
        {
          type: 'set',
          path: ['fileManagerSort', 'direction'],
          value: 'desc',
        },
      ],
    })
  })

  it('sendConfigMutationRequest 必须统一通过 config.update 事件发送 mutation request', async () => {
    mocked.send.mockResolvedValue({
      ok: true,
    })
    const request = createSetConfigPathRequest(['language'], 'en-US')

    const result = await sendConfigMutationRequest(request)

    expect(mocked.send).toHaveBeenCalledWith({
      event: 'config.update',
      data: request,
    })
    expect(result).toEqual({
      ok: true,
    })
  })
})
