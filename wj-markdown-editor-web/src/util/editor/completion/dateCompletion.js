import dayjs from 'dayjs'

function dateCompletion(context) {
  const word = context.matchBefore(/\w*/)
  if (word && word.text) {
    const lowerText = word.text.toLowerCase()
    const suggestions = []
    if ('date'.startsWith(lowerText)) {
      suggestions.push({
        label: 'date',
        type: 'text',
        detail: '日期',
        section: '时间',
        apply: (view, completion, from, to) => {
          const insert = dayjs().format('YYYY-MM-DD')
          view.dispatch({
            changes: { from, to, insert },
          })
        },
      })
    }
    if ('datetime'.startsWith(lowerText)) {
      suggestions.push({
        label: 'datetime',
        type: 'text',
        detail: '时间',
        section: '时间',
        apply: (view, completion, from, to) => {
          const insert = dayjs().format('YYYY-MM-DD HH:mm:ss')
          view.dispatch({
            changes: { from, to, insert },
          })
        },
      })
    }
    return suggestions
  }
  return []
}

export default dateCompletion
