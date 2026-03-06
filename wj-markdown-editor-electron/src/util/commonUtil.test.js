import { describe, expect, it } from 'vitest'
import commonUtil from './commonUtil.js'

describe('commonUtil.decodeWjUrl', () => {
  it('应该支持渲染端直接生成的 wj:// URL', () => {
    const filePath = './images/test.png'
    const hexValue = Buffer.from(filePath, 'utf8').toString('hex')

    expect(commonUtil.decodeWjUrl(`wj://${hexValue}?wj_date=1`)).toBe(filePath)
  })

  it('应该兼容旧的 wj:/// URL 形式', () => {
    const filePath = './images/test.png'
    const hexValue = Buffer.from(filePath, 'utf8').toString('hex')

    expect(commonUtil.decodeWjUrl(`wj:///${hexValue}?wj_date=1`)).toBe(filePath)
  })

  it('应该兼容运行时规范化后的 wj://<hex>/ URL', () => {
    const filePath = './images/test.png'
    const hexValue = Buffer.from(filePath, 'utf8').toString('hex')

    expect(commonUtil.decodeWjUrl(`wj://${hexValue}/?wj_date=1`)).toBe(filePath)
  })

  it('应该拒绝非 wj 协议 URL', () => {
    expect(() => commonUtil.decodeWjUrl('https://example.com/test.png')).toThrow('Invalid wj protocol URL')
  })
})
