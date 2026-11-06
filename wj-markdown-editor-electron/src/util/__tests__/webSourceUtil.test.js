import { describe, expect, it } from 'vitest'
import { isDevServerMode, resolveWebSource } from '../webSourceUtil.js'

describe('resolveWebSource', () => {
  it('未设置时必须回落到 web-dist', () => {
    expect(resolveWebSource({ env: {} })).toBe('dist')
    expect(isDevServerMode({ env: {} })).toBe(false)
  })

  it('显式 dev 时必须走 dev server，且忽略大小写与空白', () => {
    expect(resolveWebSource({ env: { WJ_WEB_SOURCE: 'dev' } })).toBe('dev')
    expect(isDevServerMode({ env: { WJ_WEB_SOURCE: ' DEV ' } })).toBe(true)
  })

  it('显式 dist 与非法值都必须回落到 web-dist', () => {
    expect(resolveWebSource({ env: { WJ_WEB_SOURCE: 'dist' } })).toBe('dist')
    expect(resolveWebSource({ env: { WJ_WEB_SOURCE: 'prod' } })).toBe('dist')
    expect(isDevServerMode({ env: { WJ_WEB_SOURCE: '1' } })).toBe(false)
  })

  it('环境变量 NODE_ENV 不再参与前端来源判定', () => {
    expect(resolveWebSource({ env: { NODE_ENV: 'dev' } })).toBe('dist')
    expect(isDevServerMode({ env: { NODE_ENV: 'dev' } })).toBe(false)
  })
})
