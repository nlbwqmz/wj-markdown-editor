// @unocss-include
import hljs from 'highlight.js'
import { sha256 } from 'js-sha256'

const COPY_CODE_LABEL = '复制'
const canonicalLanguageKeyByAlias = createCanonicalLanguageKeyByAlias()

/**
 * 若字符串以```结尾，则删除最后3个字符
 */
function removeTripleBackticks(inputString) {
  return inputString.endsWith('```') ? inputString.slice(0, -3) : inputString
}

/**
 * 生成 Mermaid 代码块的缓存键。
 * 仅用于 DOM 属性与缓存复用匹配，避免原始源码中的引号等字符破坏 HTML 属性。
 * 使用同步 SHA-256 库，保持 markdown-it fence 渲染链路不变。
 */
function createMermaidCacheKey(content) {
  return sha256(content.replace(/\s+/gu, ''))
}

/**
 * 生成 highlight.js 语言别名到 canonical key 的映射
 */
function createCanonicalLanguageKeyByAlias() {
  const aliasMap = new Map()

  hljs.listLanguages().forEach((languageKey) => {
    const language = hljs.getLanguage(languageKey)
    if (!language) {
      return
    }

    aliasMap.set(languageKey.toLowerCase(), languageKey)
    if (Array.isArray(language.aliases)) {
      language.aliases.forEach((alias) => {
        aliasMap.set(String(alias).toLowerCase(), languageKey)
      })
    }
  })

  return aliasMap
}

/**
 * 解析普通 fenced code block 的语言元数据。
 * 高亮计算已改为预览渲染后的分帧流程（previewCodeHighlightUtil），
 * 这里只做同步的轻量解析：语言类名、工具栏标签与延迟高亮所需的目标语言。
 */
function resolveCodeBlockLanguageMeta(info) {
  const explicitLabel = info ? info.split(/\s+/u)[0]?.trim() ?? '' : ''

  if (explicitLabel) {
    const normalizedInput = explicitLabel.toLowerCase()
    const canonicalKey = canonicalLanguageKeyByAlias.get(normalizedInput) ?? ''
    const codeClassNames = ['hljs']

    if (canonicalKey) {
      codeClassNames.push(`language-${normalizedInput}`)
      if (canonicalKey !== normalizedInput) {
        codeClassNames.push(`language-${canonicalKey}`)
      }
    }

    return {
      codeClassName: codeClassNames.join(' '),
      highlightLanguage: canonicalKey,
      toolbarLangLabel: explicitLabel,
      toolbarLangHidden: false,
    }
  }

  return {
    codeClassName: 'hljs',
    highlightLanguage: '',
    toolbarLangLabel: '',
    toolbarLangHidden: true,
  }
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

/**
 * 渲染标准代码块 HTML（不含 mermaid 分支），供 fence 与其它需要复用代码块形态的扩展调用。
 * @param {object} token 代码块 token，需携带 attrs（行号等）
 * @param {string} info 语言信息
 * @param {string} code 代码内容（未转义）
 * @param {object} md markdown-it 实例
 * @param {{ showToolbar?: boolean }} [options] showToolbar 为 false 时不输出工具栏，默认输出
 */
export function renderCodeBlockHtml(token, info, code, md, options = {}) {
  const languageMeta = resolveCodeBlockLanguageMeta(info)
  return renderStandardCodeBlockHtml(token, languageMeta, md.utils.escapeHtml(code), md, options)
}

function renderStandardCodeBlockHtml(token, languageMeta, escapedCode, md, options = {}) {
  const { showToolbar = true } = options
  const preAttrs = parseAttrs(token.attrs)
  const escapedToolbarLabel = md.utils.escapeHtml(languageMeta.toolbarLangLabel)
  const highlightLanguageAttr = languageMeta.highlightLanguage
    ? ` data-wj-hl-lang="${languageMeta.highlightLanguage}"`
    : ''
  const toolbarHtml = showToolbar
    ? html`
    <div class="pre-container-toolbar">
      <div class="pre-container-action-slot">
        <div class="pre-container-lang ${languageMeta.toolbarLangHidden ? 'hidden' : ''}">${escapedToolbarLabel}</div>
        <div class="i-tabler:copy pre-container-copy" role="button" tabindex="0" title="${COPY_CODE_LABEL}" aria-label="${COPY_CODE_LABEL}"></div>
      </div>
    </div>`
    : ''

  return html`
  <div class="pre-container">
    ${toolbarHtml}
    <pre${preAttrs ? ` ${preAttrs}` : ''}>
      <code class="${languageMeta.codeClassName}" data-wj-hl-pending="1"${highlightLanguageAttr}>`
      + escapedCode
      + html`</code>
    </pre>
  </div>
  `
}

export default function codeBlockPlugin(md) {
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const code = token.content.trim()
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
    const lang = info.split(/\s+/g)[0]
    if (lang === 'mermaid') {
      const content = removeTripleBackticks(code)
      return `<pre class="mermaid" data-code="${createMermaidCacheKey(content)}" ${parseAttrs(token.attrs)}>\n${content}\n</pre>\n`
    }

    return renderCodeBlockHtml(token, info, code, md)
  }
}
