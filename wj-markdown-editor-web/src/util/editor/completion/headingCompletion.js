function headingCompletion(context) {
  const word = context.matchBefore(/^#{1,5}/)
  if (word) {
    const text = word.text
    const suggestions = []
    for (let i = text.length; i <= 6; i++) {
      suggestions.push({
        label: `${'#'.repeat(i)}`,
        type: 'text',
        section: '标题',
        apply: (view, completion, from, to) => {
          const insert = `${'#'.repeat(i)} `
          view.dispatch({
            changes: { from: from - text.length, to, insert },
          })
        },
      })
    }
    return suggestions
  }
  return []
}

export default headingCompletion
