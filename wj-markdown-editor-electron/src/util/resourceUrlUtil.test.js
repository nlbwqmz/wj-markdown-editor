import { describe, expect, it } from 'vitest'
import {
  convertResourceUrl,
} from '../../../wj-markdown-editor-web/src/util/resourceUrlUtil.js'

describe('convertResourceUrl', () => {
  it('应该将相对路径转换为 wj 协议', () => {
    expect(convertResourceUrl('./files/demo.pdf')).toBe('wj://2e2f66696c65732f64656d6f2e706466')
  })

  it('应该将 Windows 绝对路径转换为 wj 协议', () => {
    expect(convertResourceUrl('D:/demo/test.pdf')).toBe('wj://443a2f64656d6f2f746573742e706466')
  })

  it('应该将编码过的本地相对路径转换为真实文件路径对应的 wj 协议', () => {
    expect(convertResourceUrl('./files/demo%20file.pdf')).toBe('wj://2e2f66696c65732f64656d6f2066696c652e706466')
  })

  it('应该兼容 markdown-it 规范化后的 Windows 反斜杠绝对路径', () => {
    expect(convertResourceUrl('D:%5Cdemo%5Ctest.pdf')).toBe('wj://443a2f64656d6f2f746573742e706466')
  })

  it('应该保持显式协议链接不变', () => {
    expect(convertResourceUrl('https://example.com/demo.pdf')).toBe('https://example.com/demo.pdf')
  })
})
