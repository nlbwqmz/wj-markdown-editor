import hljs from 'highlight.js'
/**
 * 若字符串以```结尾，则删除最后3个字符
 */
function removeTripleBackticks(inputString) {
  return inputString.endsWith('```') ? inputString.slice(0, -3) : inputString
}

function parseAttrs(attrs) {
  const value = []
  if (attrs && attrs.length > 0) {
    attrs.forEach((item) => {
      value.push(`${item[0]}="${item[1]}"`)
    })
  }
  return value.join(' ')
}

export default function codeBlockPlugin(md) {
  const defaultRenderer = md.renderer.rules.fence.bind(md.renderer.rules)
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx]
    const code = token.content.trim()
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''

    if (info) {
      const lang = info.split(/\s+/g)[0]
      if (lang === 'mermaid') {
        const content = removeTripleBackticks(code)
        return `<pre class="mermaid" data-code="${content.replace(/\s/g, '')}" ${parseAttrs(token.attrs)}>\n${content}\n</pre>\n`
      } else {
        try {
          return `<pre class="hljs" ${parseAttrs(token.attrs)}><code>${lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : hljs.highlightAuto(code).value}</code></pre>`
        } catch (e) {
          console.error(e)
        }
        return `<pre class="hljs" ${parseAttrs(token.attrs)}><code>${md.utils.escapeHtml(code)}</code></pre>`
      }
    }
    return defaultRenderer(tokens, idx, options, env, slf)
  }
}
