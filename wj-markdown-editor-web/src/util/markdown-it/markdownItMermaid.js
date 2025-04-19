/**
 * 若字符串以```结尾，则删除最后3个字符
 */
function removeTripleBackticks(inputString) {
  return inputString.endsWith('```') ? inputString.slice(0, -3) : inputString
}

export default function mermaidPlugin(md) {
  const defaultRenderer = md.renderer.rules.fence.bind(md.renderer.rules)
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx]
    const code = token.content.trim()
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''

    if (info && info.split(/\s+/g)[0] === 'mermaid') {
      const content = removeTripleBackticks(code)
      return `<pre class="mermaid" data-code="${content.replace(/\s/g, '')}">\n${content}\n</pre>\n`
    }
    return defaultRenderer(tokens, idx, options, env, slf)
  }
}
