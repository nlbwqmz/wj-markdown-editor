export default function (md) {
  md.inline.ruler.push('text_color', (state, silent) => {
    const start = state.pos

    if (state.src.charCodeAt(start) !== 0x7B)
      return false
    const match = state.src.slice(start).match(/^\{([^}]+)\}\(([^)]+)\)/)
    if (!match)
      return false

    if (!silent) {
      const token = state.push('html_inline', '', 0)
      const color = match[1]
      const text = match[2]
      if (color.includes('gradient')) {
        token.content = `<span class="markdown-it-text-color-gradient" style="--markdown-it-text-color: ${color}">${md.renderInline(text)}</span>`
      } else {
        token.content = `<span class="markdown-it-text-color" style="--markdown-it-text-color: ${color}">${md.renderInline(text)}</span>`
      }
    }

    state.pos += match[0].length
    return true
  })
}
