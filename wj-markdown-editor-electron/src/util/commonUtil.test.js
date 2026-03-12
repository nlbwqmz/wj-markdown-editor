import { describe, expect, it } from 'vitest'
import commonUtil from './commonUtil.js'

describe('commonUtil.decodeWjUrl', () => {
  it('应该支持渲染端直接生成的 wj:// URL', () => {
    const filePath = './images/test.png'
    const hexValue = Buffer.from(filePath, 'utf8').toString('hex')

    expect(commonUtil.decodeWjUrl(`wj://${hexValue}?wj_date=1`)).toBe(filePath)
  })

  it('应该支持文件名中包含字面百分号', () => {
    const filePath = './assets/100%_done.png'
    const hexValue = Buffer.from(filePath, 'utf8').toString('hex')

    expect(commonUtil.decodeWjUrl(`wj://${hexValue}`)).toBe(filePath)
  })

  it('应该支持中文路径解码', () => {
    const filePath = './资源/封面 100%.png'
    const hexValue = Buffer.from(filePath, 'utf8').toString('hex')

    expect(commonUtil.decodeWjUrl(`wj://${hexValue}`)).toBe(filePath)
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

  it('应该拒绝非法的 hex payload', () => {
    expect(() => commonUtil.decodeWjUrl('wj://zz')).toThrow('Invalid wj protocol payload')
    expect(() => commonUtil.decodeWjUrl('wj://abc')).toThrow('Invalid wj protocol payload')
  })

  it('应该拒绝非 wj 协议 URL', () => {
    expect(() => commonUtil.decodeWjUrl('https://example.com/test.png')).toThrow('Invalid wj protocol URL')
  })
})
