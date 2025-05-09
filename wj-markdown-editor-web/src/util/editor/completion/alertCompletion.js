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

const listLanguages = ['Note', 'Tip', 'Important', 'Warning', 'Caution']
function alertCompletion(context) {
  if (checkLineStart(context) === false) {
    return []
  }
  const word = context.matchBefore(/^>\x20*/)
  if (word) {
    const suggestions = []
    const match = word.text.match(/^>(\x20*)/)
    const offset = match[0] ? match[0].length : 0
    listLanguages.forEach((item) => {
      suggestions.push({
        label: `${item}`,
        type: 'text',
        section: '提示',
        apply: (view, completion, from, to) => {
          const insert = `> [!${item}]\n> `
          view.dispatch({
            changes: { from: to - offset, to, insert },
            selection: { anchor: to - offset + 8 + item.length },
          })
        },
      })
    })
    return suggestions
  }
  return []
}

export default alertCompletion
