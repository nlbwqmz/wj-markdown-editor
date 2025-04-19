import hljs from 'highlight.js'

const listLanguages = hljs.listLanguages().concat(['vue'])
function codeBlockCompletion(context) {
  const word = context.matchBefore(/^`{1,3}[a-z0-9]*/i)
  if (word) {
    const suggestions = []
    const match = word.text.match(/^`(`{0,2})([a-z0-9]*)/i)
    const offset = match[1] ? match[1].length + 1 : 1
    const list = match[2] ? listLanguages.filter(item => item.startsWith(match[2])) : listLanguages
    list.forEach((item) => {
      suggestions.push({
        label: `${item}`,
        type: 'text',
        section: '代码块',
        apply: (view, completion, from, to) => {
          const insert = `\`\`\`${item}\n\n\`\`\``
          view.dispatch({
            changes: { from: from - offset, to, insert },
            selection: { anchor: from - offset + 4 + item.length },
          })
        },
      })
      suggestions.push({
        label: `${item}`,
        detail: '非包围',
        type: 'text',
        section: '代码块',
        apply: (view, completion, from, to) => {
          const insert = `\`\`\`${item}`
          view.dispatch({
            changes: { from: from - offset, to, insert },
            selection: { anchor: from - offset + 4 + item.length },
          })
        },
      })
    })
    return suggestions
  }
  return []
}

export default codeBlockCompletion
