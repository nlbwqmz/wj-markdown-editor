import dayjs from 'dayjs'

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
]
function CommonCompletion(context) {
  const word = context.matchBefore(/\/(.*)/)
  const suggestions = []
  if (word && word.text) {
    const match = word.text.match(/\/(.*)/)
    if (match && match.length > 1) {
      const text = match[1]
      commonList.forEach((item) => {
        if (item.text.some(itemText => itemText.startsWith(text))) {
          suggestions.push({
            label: item.label,
            type: 'text',
            apply: (view, completion, from, to) => {
              const insert = typeof item.insert === 'function' ? item.insert() : item.insert
              // 如果关键词时中文from === to为true， 需要减去中文提示词的长度
              view.dispatch({
                changes: { from: from - (from === to ? text.length + 1 : 1), to, insert },
                selection: {
                  anchor: from + item.anchorOffset - 1 - (from === to ? text.length : 0),
                },
              })
            },
          })
        }
      })
    }
  }
  return suggestions
}

export default CommonCompletion
