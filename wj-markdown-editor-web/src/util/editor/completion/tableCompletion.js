import editorUtil from '@/util/editor/editorUtil.js'

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
function tableCompletion(context) {
  if (checkLineStart(context) === false) {
    return []
  }
  const word = context.matchBefore(/^([1-9]\d*)(x)([1-9]\d*)?$/i)
  if (!word || word.text === '') {
    return []
  }
  // 表格
  const text = word.text

  const suggestions = []
  // 表格
  const match = text.match(/^([1-9]\d*)(x)([1-9]\d*)?$/i)
  if (match) {
    const rows = Number(match[1])
    const symbol = match[2]
    const cols = match[3] ? Number(match[3]) : 1
    for (let i = 0; i < 5; i++) {
      suggestions.push({
        label: `${rows}${symbol}${cols + i}`,
        type: 'text',
        section: '表格',
        apply: (view, completion, from, to) => {
          editorUtil.insertTable(view, rows, cols + i, from, to)
        },
      })
    }
  }
  return suggestions
}

export default tableCompletion
