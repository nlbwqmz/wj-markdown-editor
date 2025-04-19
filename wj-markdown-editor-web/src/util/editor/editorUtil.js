import sendUtil from '@/util/channel/sendUtil.js'
import { redo, undo } from '@codemirror/commands'

/**
 * 获取选中的行号
 */
function getSelectedLines(view) {
  const selectedLines = new Set()
  for (const range of view.state.selection.ranges) {
    const startLine = view.state.doc.lineAt(range.from).number
    const endLine = view.state.doc.lineAt(range.to).number
    for (let line = startLine; line <= endLine; line++) {
      selectedLines.add(line)
    }
  }
  return Array.from(selectedLines).sort((a, b) => a - b)
}

/**
 * 生成表格文本
 * @param rows 行数
 * @param cols 列数
 */
function generateMarkdownTable(rows, cols) {
  let table = '\n'
  // 生成表头
  table += '|'
  for (let i = 1; i <= cols; i++) {
    table += ` head |`
  }
  table += '\n'

  // 生成分隔线
  table += '|'
  for (let i = 1; i <= cols; i++) {
    table += ' :--: |'
  }
  table += '\n'

  // 生成表格内容
  for (let i = 1; i <= rows; i++) {
    table += '|'
    for (let j = 1; j <= cols; j++) {
      table += `      |`
    }
    table += '\n'
  }

  return table
}
function insertTable(view, row, col, from, to) {
  const insert = generateMarkdownTable(row, col)
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
  })
  view.focus()
}

/**
 * 行内命令
 * @param prefix
 * @param suffix
 */
function inlineCommand(editorView, prefix, suffix = prefix) {
  const main = editorView.state.selection.main
  if (main.from - prefix.length >= 0) {
    const prefixText = editorView.state.doc.sliceString(main.from - prefix.length, main.from)
    const suffixText = editorView.state.doc.sliceString(main.to, main.to + suffix.length)
    if (prefixText === prefix && suffixText === suffix) {
      let insert = editorView.state.doc.slice(main.from - prefix.length, main.to + suffix.length).toString()
      insert = insert.substring(prefix.length, insert.length - suffix.length)
      editorView.dispatch({
        changes: {
          from: main.from - prefix.length,
          to: main.to + suffix.length,
          insert,
        },
        selection: { anchor: main.from - prefix.length, head: main.from - prefix.length + insert.length },
      })
      editorView.focus()
      return
    }
  }
  if (main.to - main.from > prefix.length + suffix.length) {
    const prefixText = editorView.state.doc.sliceString(main.from, main.from + prefix.length)
    const suffixText = editorView.state.doc.sliceString(main.to - suffix.length, main.to)
    if (prefixText === prefix && suffixText === suffix) {
      const insert = editorView.state.doc.slice(main.from + prefix.length, main.to - suffix.length).toString()
      editorView.dispatch({
        changes: {
          from: main.from,
          to: main.to,
          insert,
        },
        selection: { anchor: main.from, head: main.from + insert.length },
      })
      editorView.focus()
      return
    }
  }
  const insert = main.empty ? `${prefix}${suffix}` : `${prefix}${editorView.state.doc.slice(main.from, main.to)}${suffix}`
  editorView.dispatch({
    changes: {
      from: main.from,
      to: main.to,
      insert,
    },
    selection: { anchor: main.from + prefix.length, head: main.from + insert.length - (suffix ? suffix.length : 0) },
  })
  editorView.focus()
}

/**
 * 行命令
 */
function lineCommand(editorView, prefix) {
  const selectedLines = getSelectedLines(editorView)
  if (selectedLines && selectedLines.length > 0) {
    const changes = []
    for (const lineNumber of selectedLines) {
      const line = editorView.state.doc.line(lineNumber)
      if (line.from !== line.to) {
        // 若是标题则计算需要清除原来标题的长度
        let waitingDeleteLength = 0
        const lineText = editorView.state.doc.sliceString(line.from, line.to)
        const lineTextTrimStart = lineText.trimStart()
        if (line.to - line.from >= 3 && prefix.includes('#')) {
          if (lineTextTrimStart.startsWith('# ')) {
            waitingDeleteLength = 2
          } else if (lineTextTrimStart.startsWith('## ')) {
            waitingDeleteLength = 3
          } else if (lineTextTrimStart.startsWith('### ')) {
            waitingDeleteLength = 4
          } else if (lineTextTrimStart.startsWith('#### ')) {
            waitingDeleteLength = 5
          } else if (lineTextTrimStart.startsWith('##### ')) {
            waitingDeleteLength = 6
          } else if (lineTextTrimStart.startsWith('###### ')) {
            waitingDeleteLength = 7
          }
        }
        changes.push({
          from: line.from, // 行的起始位置
          to: line.from + waitingDeleteLength + (lineText.length - lineTextTrimStart.length), // 排除标题行头有空格的情况
          insert: prefix,
        })
      }
    }
    if (changes.length > 0) {
      editorView.dispatch({
        changes,
      })
    }
  }
  editorView.focus()
}

function convertNumberList(editorView) {
  const selectedLines = getSelectedLines(editorView)
  if (selectedLines && selectedLines.length > 0) {
    const changes = []
    let anchor
    let offset = 0
    for (let i = 0; i < selectedLines.length; i++) {
      const lineNumber = selectedLines[i]
      const line = editorView.state.doc.line(lineNumber)
      if (line.from !== line.to) {
        const insert = `${i + 1}. `
        changes.push({
          from: line.from, // 行的起始位置
          to: line.from, // 插入位置（行的开头）
          insert,
        })
        anchor = line.to
        offset += insert.length
      }
    }
    // 应用修改
    if (changes.length > 0) {
      editorView.dispatch({
        changes,
        selection: { anchor: anchor + offset },
      })
    }
  }
  editorView.focus()
}

function blockCode(editorView) {
  const main = editorView.state.selection.main
  const prefix = '\n\`\`\`language\n'
  const suffix = '\n\`\`\`\n'
  const insert = main.empty ? `${prefix}${suffix}` : `${prefix}${editorView.state.doc.slice(main.from, main.to)}${suffix}`
  editorView.dispatch({
    changes: {
      from: main.from,
      to: main.to,
      insert,
    },
    selection: { anchor: editorView.state.selection.main.from + 4, head: editorView.state.selection.main.from + 12 },
  })
  editorView.focus()
}

function link(editorView) {
  if (editorView.state.selection && editorView.state.selection.main) {
    const main = editorView.state.selection.main
    if (main.empty === false) {
      const text = editorView.state.doc.slice(main.from, main.to)
      const insert = `[链接](<${text}>)`
      editorView.dispatch({
        changes: {
          from: main.from,
          to: main.to,
          insert,
        },
        selection: { anchor: main.from + 1, head: main.from + 3 },
      })
    } else {
      const insert = `[链接](<>)`
      editorView.dispatch({
        changes: {
          from: main.from,
          to: main.to,
          insert,
        },
        selection: { anchor: main.from + 6, head: main.from + 6 },
      })
    }
  }
  editorView.focus()
}

function image(editorView) {
  if (editorView.state.selection && editorView.state.selection.main) {
    const main = editorView.state.selection.main
    const insert = '![图片](<>)'
    editorView.dispatch({
      changes: {
        from: main.to,
        to: main.to,
        insert,
      },
      selection: { anchor: main.to + 7 },
    })
  }
  editorView.focus()
}

function insertImageToEditor(editorView, fileInfo) {
  if (fileInfo) {
    const to = editorView.state.selection.main.to
    // 如果当前行不为空的话，则需要使用换行符
    let wrap = false
    const line = editorView.state.doc.lineAt(to)
    if (line.from !== line.to) {
      wrap = true
    }
    const insert = `${wrap === true ? '\n' : ''}![${fileInfo.name}](<${fileInfo.path}>)`

    editorView.dispatch({
      changes: {
        from: to,
        to,
        insert,
      },
      selection: { anchor: to + insert.length },
    })
  }
  editorView.focus()
}

function imageLocal(editorView) {
  if (editorView.state.selection && editorView.state.selection.main) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.addEventListener('change', (event) => {
      if (event.target && event.target.files && event.target.files.length > 0) {
        const selectedFile = event.target.files[0]
        const reader = new FileReader()
        reader.onload = async function (event) {
          // 直接获取 Base64 的 DataURL 格式
          const fileInfo = await sendUtil.send({
            event: 'upload-image',
            data: {
              mode: 'local',
              type: selectedFile.type,
              name: selectedFile.name,
              base64: event.target.result,
            },
          })
          insertImageToEditor(editorView, fileInfo)
        }
        reader.readAsDataURL(selectedFile)
      }
    })
    input.click()
  }
  editorView.focus()
}

async function screenshot(editorView, hide) {
  const fileInfo = await sendUtil.send({ event: 'screenshot', data: { hide } })
  insertImageToEditor(editorView, fileInfo)
}

function alertContainer(editorView, type) {
  const main = editorView.state.selection.main
  const prefix = `\n> [!${type.toUpperCase()}]\n> `
  const insert = main.empty ? prefix : `${prefix}${editorView.state.doc.slice(main.from, main.to)}`
  editorView.dispatch({
    changes: {
      from: main.from,
      to: main.to,
      insert,
    },
    selection: { anchor: main.from + insert.length },
  })
  editorView.focus(editorView)
}

function container(editorView, type) {
  const main = editorView.state.selection.main
  const prefix = `\n::: ${type.toUpperCase()}\n`
  const suffix = `\n:::`
  const insert = main.empty ? `${prefix}${suffix}` : `${prefix}${editorView.state.doc.slice(main.from, main.to)}${suffix}`
  editorView.dispatch({
    changes: {
      from: main.from,
      to: main.to,
      insert,
    },
    selection: { anchor: main.from + insert.length - 4 },
  })
  editorView.focus(editorView)
}

export default {
  insertTable,
  bold: (editorView) => { inlineCommand(editorView, '**') },
  code: (editorView) => { inlineCommand(editorView, '\`') },
  underline: (editorView) => { inlineCommand(editorView, '<u>', '</u>') },
  italic: (editorView) => { inlineCommand(editorView, '_') },
  strikeThrough: (editorView) => { inlineCommand(editorView, '~~') },
  heading: (editorView, level) => { lineCommand(editorView, `${'#'.repeat(level)} `) },
  subscript: (editorView) => { inlineCommand(editorView, '~') },
  superscript: (editorView) => { inlineCommand(editorView, '^') },
  quote: (editorView) => { lineCommand(editorView, '> ') },
  list: (editorView) => { lineCommand(editorView, '- ') },
  numberList: (editorView) => { convertNumberList(editorView) },
  taskList: (editorView) => { lineCommand(editorView, '- [ ] ') },
  undo: (editorView) => { undo(editorView) },
  redo: (editorView) => { redo(editorView) },
  blockCode: (editorView) => { blockCode(editorView) },
  link: (editorView) => { link(editorView) },
  mark: (editorView) => { inlineCommand(editorView, '==') },
  image: (editorView) => { image(editorView) },
  imageLocal: (editorView) => { imageLocal(editorView) },
  screenshot: (editorView, hide) => { screenshot(editorView, hide).then(() => {}) },
  alertContainer: (editorView, type) => { alertContainer(editorView, type) },
  container: (editorView, type) => { container(editorView, type) },
  insertImageToEditor,
}
