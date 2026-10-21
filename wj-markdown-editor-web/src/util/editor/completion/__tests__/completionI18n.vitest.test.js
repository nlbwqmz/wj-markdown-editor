import { describe, expect, it } from 'vitest'

import enUS from '@/i18n/enUS.js'
import zhCN from '@/i18n/zhCN.js'
import alertCompletion from '../alertCompletion.js'
import codeBlockCompletion from '../codeBlockCompletion.js'
import containerCompletion from '../containerCompletion.js'
import headingCompletion from '../headingCompletion.js'
import tableCompletion from '../tableCompletion.js'

/**
 * 用真实语言包构造 translator，保证测试验证的是实际翻译数据而不是 mock 字符串。
 */
function createT(messages) {
  return key => key.split('.').reduce((acc, part) => acc?.[part], messages) ?? key
}

/**
 * 按 CodeMirror 语义构造最小 mock context：matchBefore 要求匹配结束于 pos。
 */
function createMockContext(docText, pos = docText.length) {
  return {
    pos,
    state: {
      doc: {
        lineAt(target) {
          const lineStart = docText.lastIndexOf('\n', target - 1) + 1
          const nextBreak = docText.indexOf('\n', target)
          const lineEnd = nextBreak === -1 ? docText.length : nextBreak
          return {
            from: lineStart,
            to: lineEnd,
            text: docText.slice(lineStart, lineEnd),
          }
        },
      },
    },
    matchBefore(re) {
      const before = docText.slice(0, pos)
      const anchored = new RegExp(`${re.source}$`, re.flags.replaceAll('g', ''))
      const match = before.match(anchored)
      if (!match) {
        return null
      }
      return { from: match.index, to: pos, text: match[0] }
    },
  }
}

const t = createT(zhCN)
const tEn = createT(enUS)

describe('语法补全器 section 国际化', () => {
  it('标题补全 section 应随 locale 变化', () => {
    expect(headingCompletion(createMockContext('#'), t)[0].section).toBe('标题')
    expect(headingCompletion(createMockContext('#'), tEn)[0].section).toBe('Heading')
  })

  it('表格补全 section 应随 locale 变化', () => {
    expect(tableCompletion(createMockContext('2x3'), t)[0].section).toBe('表格（行x列）')
    expect(tableCompletion(createMockContext('2x3'), tEn)[0].section).toBe('Table (rows x cols)')
  })

  it('代码块补全 section 应随 locale 变化', () => {
    expect(codeBlockCompletion(createMockContext('```'), t)[0].section).toBe('代码块')
    expect(codeBlockCompletion(createMockContext('```'), tEn)[0].section).toBe('Code block')
  })

  it('容器补全 section 应随 locale 变化', () => {
    expect(containerCompletion(createMockContext(':'), t)[0].section).toBe('容器')
    expect(containerCompletion(createMockContext(':'), tEn)[0].section).toBe('Container')
  })

  it('提示补全 section 应随 locale 变化', () => {
    expect(alertCompletion(createMockContext('> '), t)[0].section).toBe('提示')
    expect(alertCompletion(createMockContext('> '), tEn)[0].section).toBe('Alert')
  })
})
