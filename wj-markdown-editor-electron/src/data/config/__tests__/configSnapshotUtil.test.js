import { describe, expect, it } from 'vitest'
import { cloneConfig } from '../configSnapshotUtil.js'

describe('configSnapshotUtil', () => {
  it('必须返回深拷贝，防止调用方回写内存态', () => {
    const source = { theme: { global: 'light' } }
    const snapshot = cloneConfig(source)
    snapshot.theme.global = 'dark'
    expect(source.theme.global).toBe('light')
  })
})
