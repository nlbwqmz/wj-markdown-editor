import dayjs from 'dayjs'

const containerTypes = ['Info', 'Tip', 'Important', 'Warning', 'Danger', 'Detail']
const alertTypes = ['Note', 'Tip', 'Important', 'Warning', 'Caution']

// 容器命令：数据驱动生成，避免逐条重复字面量
const containerItems = containerTypes.map((type) => {
  const lower = type.toLowerCase()
  return {
    label: `容器 ${type}`,
    text: [`container-${lower}`, `container${lower}`, `容器${lower}`, `容器-${lower}`],
    insert: `::: ${type}\n\n:::`,
    anchorOffset: 5 + type.length,
    section: '容器',
    scope: 'block',
  }
})

// GitHub Alert 命令：数据驱动生成
const alertItems = alertTypes.map((type) => {
  const lower = type.toLowerCase()
  return {
    label: `提示 ${type}`,
    text: [`alert-${lower}`, `alert${lower}`, `提示${lower}`, `提示-${lower}`],
    insert: `> [!${type}]\n> `,
    anchorOffset: 8 + type.length,
    section: '提示',
    scope: 'block',
  }
})

const commonList = [
  {
    label: '音频',
    text: ['audio', 'yp', 'yinpin', '音频', '!audio'],
    insert: '!audio()',
    anchorOffset: 7,
  },
  {
    label: '视频',
    text: ['video', 'sp', 'shipin', '视频', '!video'],
    insert: '!video()',
    anchorOffset: 7,
  },
  {
    label: '日期',
    text: ['date', 'rq', 'riqi', '日期'],
    insert: () => dayjs().format('YYYY-MM-DD'),
    anchorOffset: 10,
  },
  {
    label: '时间',
    text: ['datetime', 'sj', 'shijian', 'time', '时间'],
    insert: () => dayjs().format('YYYY-MM-DD HH:mm:ss'),
    anchorOffset: 19,
  },
  {
    label: '图片',
    text: ['image', 'tp', 'tupian', '图片'],
    insert: '![图片](<>)',
    anchorOffset: 7,
  },
  {
    label: '链接',
    text: ['link', 'lj', 'lianjie', '链接'],
    insert: '[](<>)',
    anchorOffset: 1,
  },
  {
    label: '文字颜色',
    text: ['color', 'text', 'ys', 'wzys', '文字颜色'],
    insert: '{red}()',
    anchorOffset: 6,
  },
  ...containerItems,
  ...alertItems,
  {
    label: '图表',
    text: ['mermaid', 'tb', 'tubiao', '图表', 'liuchengtu', '流程图'],
    insert: '```mermaid\n\n```',
    anchorOffset: 11,
    section: '图表',
    scope: 'block',
  },
  {
    label: '任务列表',
    text: ['task', 'todo', 'rwlb', 'renwuliebiao', '任务列表', '待办'],
    insert: '- [ ] ',
    anchorOffset: 6,
    section: '任务列表',
    scope: 'block',
  },
]

// 判定 / 的触发与展示范围：
// canTrigger —— / 前一位是空白字符，或 / 就在行首（紧贴内容的 / 不触发）
// allowBlock —— / 之前全是空白，即真正的行首（仅此时展示块级命令）
function getSlashContext(context, slashPos) {
  const line = context.state.doc.lineAt(slashPos)
  const before = line.text.slice(0, slashPos - line.from)
  return {
    canTrigger: before === '' || /\s$/.test(before),
    allowBlock: /^\s*$/.test(before),
  }
}

function CommonCompletion(context) {
  const word = context.matchBefore(/\/(.*)/)
  if (!word || !word.text) {
    return []
  }
  const match = word.text.match(/\/(.*)/)
  if (!match || match.length < 2) {
    return []
  }

  const text = match[1]
  const { canTrigger, allowBlock } = getSlashContext(context, word.from)
  // / 必须位于行首或紧跟空白字符，紧贴内容的 /（含 https:// 这类协议）一律不触发
  if (!canTrigger) {
    return []
  }

  const suggestions = []
  commonList.forEach((item) => {
    // 行内模式下只保留行内元素
    if (!allowBlock && item.scope === 'block') {
      return
    }
    if (!item.text.some(alias => alias.startsWith(text))) {
      return
    }
    suggestions.push({
      label: item.label,
      type: 'text',
      ...(item.section ? { section: item.section } : {}),
      apply: (view, completion, from, to) => {
        const insert = typeof item.insert === 'function' ? item.insert() : item.insert
        // 统一基于 to（恒等于光标位置）计算删除区间，text.length + 1 正好覆盖 / 前缀，
        // 含 -、! 或中英混合的别名也能整段替换，不会残留 /xxx 片段
        const base = to - (text.length + 1)
        view.dispatch({
          changes: { from: base, to, insert },
          selection: { anchor: base + item.anchorOffset },
        })
      },
    })
  })
  return suggestions
}

export default CommonCompletion
