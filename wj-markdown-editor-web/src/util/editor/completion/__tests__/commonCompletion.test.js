import assert from 'node:assert/strict'

import enUS from '../../../../i18n/enUS.js'
import zhCN from '../../../../i18n/zhCN.js'
import CommonCompletion from '../CommonCompletion.js'

const { test } = await import('node:test')

/**
 * 用真实语言包构造 translator，避免单测依赖 vue-i18n 与运行环境 locale。
 * key 缺失时回退返回 key，便于直接看出漏配的翻译项。
 */
function createT(messages) {
  return key => key.split('.').reduce((acc, part) => acc?.[part], messages) ?? key
}

const t = createT(zhCN)

/**
 * 按 CodeMirror 语义构造 mock context：
 * matchBefore 从 pos 向前匹配行内文本，要求匹配结束于 pos，
 * 返回 { from, to, text }，其中 to === pos。
 * state.doc.lineAt 返回光标所在行，用于判定 / 的触发位置与行首范围。
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

/**
 * 模拟 completionHandler 中 matchBefore 用 \w* 匹配得到的替换起点，
 * 仅用于还原 apply 的真实入参；新公式不再依赖该值。
 */
function getWordFromBefore(docText, pos) {
  const match = docText.slice(0, pos).match(/\w*$/)
  return match ? match.index : pos
}

function createMockView() {
  const dispatchList = []
  return {
    dispatchList,
    dispatch(spec) {
      dispatchList.push(spec)
    },
  }
}

function getSuggestions(docText) {
  return CommonCompletion(createMockContext(docText), t)
}

function applyCompletion(docText, predicate) {
  const suggestions = getSuggestions(docText)
  const target = suggestions.find(predicate)
  assert.ok(target, `未在 "${docText}" 的候选中找到目标命令`)

  const view = createMockView()
  const pos = docText.length
  target.apply(view, target, getWordFromBefore(docText, pos), pos)

  assert.equal(view.dispatchList.length, 1)
  return view.dispatchList[0]
}

test('输入 "/" 应返回全部 20 条命令', () => {
  const suggestions = getSuggestions('/')

  assert.equal(suggestions.length, 20)
})

test('输入 "/container" 应恰好返回 6 条容器命令', () => {
  const suggestions = getSuggestions('/container')

  assert.equal(suggestions.length, 6)
  assert.ok(suggestions.every(item => item.section.name === '容器'))
})

test('输入 "/提示" 应恰好返回 5 条提示命令', () => {
  const suggestions = getSuggestions('/提示')

  assert.equal(suggestions.length, 5)
  assert.ok(suggestions.every(item => item.section.name === '提示'))
})

test('输入 "/mermaid" 应命中图表命令', () => {
  const suggestions = getSuggestions('/mermaid')

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].label, '图表')

  // 候选项本身不透传 insert，通过 apply 的 dispatch 结果验证插入文本
  const spec = applyCompletion('/mermaid', item => item.label === '图表')
  assert.equal(spec.changes.insert, '```mermaid\n\n```')
})

test('输入 "/todo" 应命中任务列表命令', () => {
  const suggestions = getSuggestions('/todo')

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].label, '任务列表')

  // 候选项本身不透传 insert，通过 apply 的 dispatch 结果验证插入文本
  const spec = applyCompletion('/todo', item => item.label === '任务列表')
  assert.equal(spec.changes.insert, '- [ ] ')
})

test('apply 英文别名应基于 to 计算替换区间', () => {
  const spec = applyCompletion('/container-info', item => item.label === '容器 Info')

  assert.equal(spec.changes.from, 0)
  assert.equal(spec.changes.to, 15)
  assert.equal(spec.changes.insert, '::: Info\n\n:::')
  assert.equal(spec.selection.anchor, 9)
})

test('apply 中文混合别名应整段替换且不残留斜杠片段', () => {
  const spec = applyCompletion('/容器tip', item => item.label === '容器 Tip')

  assert.equal(spec.changes.from, 0)
  assert.equal(spec.changes.to, 6)
  assert.equal(spec.changes.insert, '::: Tip\n\n:::')
  assert.equal(spec.selection.anchor, 8)
})

test('apply 提示别名应生成 GitHub Alert 区块', () => {
  const spec = applyCompletion('/提示note', item => item.label === '提示 Note')

  assert.equal(spec.changes.from, 0)
  // "/提示note" 共 7 个 UTF-16 码元，替换区间终点即光标位置
  assert.equal(spec.changes.to, 7)
  assert.equal(spec.changes.insert, '> [!Note]\n> ')
  assert.equal(spec.selection.anchor, 12)
})

test('行内输入 "正文 /" 只返回 7 条行内命令', () => {
  const suggestions = getSuggestions('正文 /')

  assert.equal(suggestions.length, 7)
  assert.ok(suggestions.every(item => item.section.name === '通用'))
})

test('行内输入 "正文 /mermaid" 不返回块级图表命令', () => {
  const suggestions = getSuggestions('正文 /mermaid')

  assert.equal(suggestions.length, 0)
})

test('行内输入 "正文 /图片" 仍可命中行内图片命令', () => {
  const suggestions = getSuggestions('正文 /图片')

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].label, '图片')
})

test('行首带空格缩进输入 "    /容器" 返回 6 条容器命令', () => {
  const suggestions = getSuggestions('    /容器')

  assert.equal(suggestions.length, 6)
  assert.ok(suggestions.every(item => item.section.name === '容器'))
})

test('行首带制表符缩进输入应返回全部 20 条命令', () => {
  const suggestions = getSuggestions('\t/')

  assert.equal(suggestions.length, 20)
})

test('行内输入 "abc/容器" 不返回块级容器命令', () => {
  const suggestions = getSuggestions('abc/容器')

  assert.equal(suggestions.length, 0)
})

test('协议场景 "https://" 不触发命令', () => {
  const suggestions = getSuggestions('https://')

  assert.equal(suggestions.length, 0)
})

test('行内协议场景 "见 https://x" 不触发命令', () => {
  const suggestions = getSuggestions('见 https://x')

  assert.equal(suggestions.length, 0)
})

test('紧贴数字的 "2024/" 不触发命令', () => {
  const suggestions = getSuggestions('2024/')

  assert.equal(suggestions.length, 0)
})

test('紧贴汉字的 "正文/l" 不触发命令', () => {
  const suggestions = getSuggestions('正文/l')

  assert.equal(suggestions.length, 0)
})

test('空格后的 "正文 /l" 触发并命中链接命令', () => {
  const suggestions = getSuggestions('正文 /l')

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].label, '链接')
})

test('空格后的 "a /mermaid" 触发但过滤块级命令', () => {
  const suggestions = getSuggestions('a /mermaid')

  assert.equal(suggestions.length, 0)
})

test('输入 "/info" 应命中容器 Info 的裸类型别名', () => {
  const suggestions = getSuggestions('/info')

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].label, '容器 Info')
})

test('输入 "/note" 应命中提示 Note 的裸类型别名', () => {
  const suggestions = getSuggestions('/note')

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].label, '提示 Note')
})

test('输入 "/tip" 应同时命中容器与提示的 Tip', () => {
  const suggestions = getSuggestions('/tip')

  assert.equal(suggestions.length, 2)
  assert.deepEqual(suggestions.map(item => item.label).sort(), ['容器 Tip', '提示 Tip'])
  assert.deepEqual(suggestions.map(item => item.section.name).sort(), ['容器', '提示'])
})

test('输入 "/警告" 应同时命中容器与提示的 Warning', () => {
  const suggestions = getSuggestions('/警告')

  assert.equal(suggestions.length, 2)
  assert.ok(suggestions.every(item => item.label.endsWith('Warning')))
})

test('输入 "/折叠" 应命中容器 Detail 的中文语义别名', () => {
  const suggestions = getSuggestions('/折叠')

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].label, '容器 Detail')
})

test('输入 "/error" 应命中容器 Danger 的英文语义别名', () => {
  const suggestions = getSuggestions('/error')

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].label, '容器 Danger')
})

test('输入 "/rongqi" 应返回 6 条容器命令', () => {
  const suggestions = getSuggestions('/rongqi')

  assert.equal(suggestions.length, 6)
  assert.ok(suggestions.every(item => item.section.name === '容器'))
})

test('输入 "/rq" 应同时命中日期与 6 条容器命令', () => {
  const suggestions = getSuggestions('/rq')

  assert.equal(suggestions.length, 7)
  assert.equal(suggestions.filter(item => item.section.name === '容器').length, 6)
  assert.equal(suggestions.filter(item => item.label === '日期').length, 1)
})

test('行内输入 "正文 /rq" 只保留日期命令', () => {
  const suggestions = getSuggestions('正文 /rq')

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].label, '日期')
})

test('输入 "/tishi" 与 "/ts" 均应返回 5 条提示命令', () => {
  const tishiSuggestions = getSuggestions('/tishi')
  const tsSuggestions = getSuggestions('/ts')

  assert.equal(tishiSuggestions.length, 5)
  assert.equal(tsSuggestions.length, 5)
  assert.ok(tishiSuggestions.every(item => item.section.name === '提示'))
  assert.ok(tsSuggestions.every(item => item.section.name === '提示'))
})

test('输入 "/callout" 应返回 5 条提示命令', () => {
  const suggestions = getSuggestions('/callout')

  assert.equal(suggestions.length, 5)
  assert.ok(suggestions.every(item => item.section.name === '提示'))
})

test('输入带空格的 "/容器 Info" 应命中容器 Info', () => {
  const suggestions = getSuggestions('/容器 Info')

  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].label, '容器 Info')
})

test('输入大写的 "/Container" 应返回 6 条容器命令', () => {
  const suggestions = getSuggestions('/Container')

  assert.equal(suggestions.length, 6)
  assert.ok(suggestions.every(item => item.section.name === '容器'))
})

test('英文 locale 下容器 label 与 section 应走英文文案', () => {
  const suggestions = CommonCompletion(createMockContext('/container'), createT(enUS))

  assert.equal(suggestions.length, 6)
  assert.equal(suggestions[0].label, 'Container Info')
  assert.ok(suggestions.every(item => item.section.name === 'Container'))
})

test('英文 locale 下斜杠命令 label 应走英文文案', () => {
  const suggestions = CommonCompletion(createMockContext('/'), createT(enUS))
  const labels = suggestions.map(item => item.label)

  assert.equal(suggestions.length, 20)
  assert.ok(labels.includes('Audio'))
  assert.ok(labels.includes('Date'))
  assert.ok(labels.includes('Task list'))
  assert.ok(labels.includes('Alert Note'))
})
