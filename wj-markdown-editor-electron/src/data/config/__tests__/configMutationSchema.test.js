import { describe, expect, it } from 'vitest'
import { validateConfigMutationRequest } from '../configMutationSchema.js'

describe('validateConfigMutationRequest', () => {
  it('允许白名单 set 路径', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path: ['theme', 'global'], value: 'dark' },
      ],
    })).not.toThrow()
  })

  it('拒绝未知路径', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path: ['theme', 'unknown'], value: true },
      ],
    })).toThrow(/未知配置更新路径/)
  })

  it('拒绝 shortcutKeyList 下标写法', () => {
    expect(() => validateConfigMutationRequest({
      operations: [
        { type: 'set', path: ['shortcutKeyList', 0, 'enabled'], value: false },
      ],
    })).toThrow(/shortcutKeyList 仅允许按 id 更新/)
  })
})
