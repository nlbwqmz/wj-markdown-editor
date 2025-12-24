import commonUtil from '@/util/commonUtil.js'
// @unocss-include
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

/**
 * 标签模板函数：处理多行模板字符串，自动去除多余的换行和缩进
 * @param {TemplateStringsArray} strings 模板字符串的静态部分
 * @param {...any} values 模板字符串的动态值部分
 * @returns {string} 处理后的字符串
 */
function html(strings, ...values) {
  let result = ''
  // 合并模板字符串和动态值
  for (let i = 0; i < strings.length; i++) {
    result += strings[i]
    if (i < values.length) {
      result += values[i]
    }
  }
  // 去除多余的换行和缩进
  return result
    .replace(/^\s+$/gm, '') // 去除空行
    .replace(/^(\s+)/gm, '') // 去除每行开头的缩进
    .replace(/\n+/g, '') // 合并连续的换行
    .trim() // 去除首尾的空白
}

export default function codeBlockPlugin(md) {
  const defaultRenderer = md.renderer.rules.fence.bind(md.renderer.rules)
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx]
    const code = token.content.trim()
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
    const lang = info.split(/\s+/g)[0]
    if (lang === 'mermaid') {
      const content = removeTripleBackticks(code)
      return `<pre class="mermaid" data-code="${content.replace(/\s/g, '')}" ${parseAttrs(token.attrs)}>\n${content}\n</pre>\n`
    } else {
      try {
        return html`
        <div class="relative pre-container">
          <div class="absolute top-0 right-0 p-1 z-10">
            <div class="font-bold op-80 color-[var(--wj-markdown-text-secondary)] pre-container-lang font-size-3 line-height-3">${lang}</div>
            <div class="i-tabler:copy cursor-pointer op-80 color-[var(--wj-markdown-text-secondary)] pre-container-copy hidden font-size-3.5 hover:op-100" title="复制" onclick="copyCode('${commonUtil.strToBase64(code)}')"></div>
          </div>
          <pre class="hljs" ${parseAttrs(token.attrs)}>
            <code>`
          + (lang && hljs.getLanguage(lang)
            ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
            : hljs.highlightAuto(code).value)
          + html`</code>
          </pre>
        </div>
        `
      } catch (e) {
        console.error(e)
      }
    }
    return defaultRenderer(tokens, idx, options, env, slf)
  }
}
