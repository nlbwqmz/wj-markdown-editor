import dayjs from 'dayjs'

// 命令文案统一走 t()，数据层只保留 key，避免在补全层写死中文
const translate = key => t => t(key)

// 斜杠命令统一分三组：通用 → 容器 → 提示。
// rank 决定分组顺序，组内顺序由 commonList 的数组顺序决定。
const SECTION_GENERAL = { key: 'editor.section.general', rank: 1 }
const SECTION_CONTAINER = { key: 'editor.container', rank: 2 }
const SECTION_ALERT = { key: 'editor.alert', rank: 3 }

const containerTypes = ['Info', 'Tip', 'Important', 'Warning', 'Danger', 'Detail']
const alertTypes = ['Note', 'Tip', 'Important', 'Warning', 'Caution']

// 容器补充别名：中文语义名与常见写法
const containerExtraAlias = {
  Info: ['信息', '说明'],
  Tip: ['技巧', '小贴士', '贴士'],
  Important: ['重要'],
  Warning: ['警告', '警示'],
  Danger: ['危险', '错误', 'error'],
  Detail: ['详情', '折叠', '收起', 'details'],
}

// GitHub Alert 补充别名：与容器重名的语义名保留，靠 section 与 label 区分
const alertExtraAlias = {
  Note: ['笔记', '备注', '说明'],
  Tip: ['技巧', '小贴士', '贴士'],
  Important: ['重要'],
  Warning: ['警告', '警示'],
  Caution: ['注意', '小心', '谨慎'],
}

// 容器命令：数据驱动生成，避免逐条重复字面量
const containerItems = containerTypes.map((type) => {
  const lower = type.toLowerCase()
  return {
    label: t => `${t('editor.container')} ${type}`,
    text: [
      `container-${lower}`,
      `container${lower}`,
      `容器${lower}`,
      `容器-${lower}`,
      lower,
      ...containerExtraAlias[type],
      'rongqi',
      'rq',
    ],
    insert: `::: ${type}\n\n:::`,
    anchorOffset: 5 + type.length,
    section: SECTION_CONTAINER,
    scope: 'block',
  }
})

// GitHub Alert 命令：数据驱动生成
const alertItems = alertTypes.map((type) => {
  const lower = type.toLowerCase()
  return {
    label: t => `${t('editor.alert')} ${type}`,
    text: [
      `alert-${lower}`,
      `alert${lower}`,
      `提示${lower}`,
      `提示-${lower}`,
      lower,
      ...alertExtraAlias[type],
      'callout',
      'tishi',
      'ts',
    ],
    insert: `> [!${type}]\n> `,
    anchorOffset: 8 + type.length,
    section: SECTION_ALERT,
    scope: 'block',
  }
})

// 通用组顺序：高频行内命令在前，块级图表/任务列表居中，文字颜色收尾
const commonList = [
  {
    label: translate('editor.image'),
    text: ['image', 'tp', 'tupian', '图片'],
    insert: '![图片](<>)',
    anchorOffset: 7,
    section: SECTION_GENERAL,
  },
  {
    label: translate('editor.command.link'),
    text: ['link', 'lj', 'lianjie', '链接'],
    insert: '[](<>)',
    anchorOffset: 1,
    section: SECTION_GENERAL,
  },
  {
    label: translate('editor.audio'),
    text: ['audio', 'yp', 'yinpin', '音频', '!audio'],
    insert: '!audio()',
    anchorOffset: 7,
    section: SECTION_GENERAL,
  },
  {
    label: translate('editor.video'),
    text: ['video', 'sp', 'shipin', '视频', '!video'],
    insert: '!video()',
    anchorOffset: 7,
    section: SECTION_GENERAL,
  },
  {
    label: translate('editor.command.date'),
    text: ['date', 'rq', 'riqi', '日期'],
    insert: () => dayjs().format('YYYY-MM-DD'),
    anchorOffset: 10,
    section: SECTION_GENERAL,
  },
  {
    label: translate('editor.command.time'),
    text: ['datetime', 'sj', 'shijian', 'time', '时间'],
    insert: () => dayjs().format('YYYY-MM-DD HH:mm:ss'),
    anchorOffset: 19,
    section: SECTION_GENERAL,
  },
  {
    label: translate('editor.command.chart'),
    text: ['mermaid', 'tb', 'tubiao', '图表', 'liuchengtu', '流程图'],
    insert: '```mermaid\n\n```',
    anchorOffset: 11,
    section: SECTION_GENERAL,
    scope: 'block',
  },
  {
    label: translate('editor.command.taskList'),
    text: ['task', 'todo', 'rwlb', 'renwuliebiao', '任务列表', '待办'],
    insert: '- [ ] ',
    anchorOffset: 6,
    section: SECTION_GENERAL,
    scope: 'block',
  },
  {
    label: translate('editor.textColor'),
    text: ['color', 'text', 'ys', 'wzys', '文字颜色'],
    insert: '{red}()',
    anchorOffset: 6,
    section: SECTION_GENERAL,
  },
  ...containerItems,
  ...alertItems,
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

function CommonCompletion(context, t = key => key) {
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

  // 匹配时忽略大小写与空白，允许 "/容器 Info"、"/Container" 这类写法
  const normalizedText = text.replaceAll(/\s+/g, '').toLowerCase()
  const suggestions = []
  commonList.forEach((item) => {
    // 行内模式下只保留行内元素
    if (!allowBlock && item.scope === 'block') {
      return
    }
    if (!item.text.some(alias => alias.replaceAll(/\s+/g, '').toLowerCase().startsWith(normalizedText))) {
      return
    }
    suggestions.push({
      label: item.label(t),
      type: 'text',
      // 对象形式的 section 才能用 rank 固定分组顺序，字符串形式会按分组名码点排序
      ...(item.section
        ? { section: { name: t(item.section.key), rank: item.section.rank } }
        : {}),
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
