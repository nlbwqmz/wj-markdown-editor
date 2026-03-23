import { describe, expect, it } from 'vitest'
import { validateConfigShape } from '../configSchema.js'

describe('configSchema', () => {
  it('非法 language 必须被识别为 schema 违规', () => {
    expect(() => validateConfigShape({ language: 'jp-JP' })).toThrow()
  })
})
