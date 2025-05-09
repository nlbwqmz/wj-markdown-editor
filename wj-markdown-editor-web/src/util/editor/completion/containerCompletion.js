function checkLineStart(context) {
  const word = context.matchBefore(/.*/)
  if (!word) {
    return false
  }
  const line = context.state.doc.lineAt(context.pos)
  if (!line) {
    return false
  }
  const lineText = line.text
  if (!lineText) {
    return false
  }
  return word.text === lineText
}

const listLanguages = ['Info', 'Tip', 'Important', 'Warning', 'Danger', 'Detail']
function containerCompletion(context) {
  if (checkLineStart(context) === false) {
    return []
  }
  const word = context.matchBefore(/^:{1,3}[\x20a-z]*/)
  if (word) {
    const suggestions = []
    const match = word.text.match(/^:(:{0,2})([\x20a-z]*)/i)
    const offset = match[0] ? match[0].length : 0
    const list = match[2] ? listLanguages.filter(item => item.toLowerCase().startsWith(match[2].replaceAll(' ', '').toLowerCase())) : listLanguages
    list.forEach((item) => {
      suggestions.push({
        label: `${item}`,
        type: 'text',
        section: '容器',
        apply: (view, completion, from, to) => {
          const insert = `::: ${item}\n\n:::`
          view.dispatch({
            changes: { from: to - offset, to, insert },
            selection: { anchor: to - offset + 5 + item.length },
          })
        },
      })
      suggestions.push({
        label: `${item}`,
        detail: '非包围',
        type: 'text',
        section: '容器',
        apply: (view, completion, from, to) => {
          const insert = `::: ${item}`
          view.dispatch({
            changes: { from: to - offset, to, insert },
          })
        },
      })
    })
    return suggestions
  }
  return []
}

export default containerCompletion
