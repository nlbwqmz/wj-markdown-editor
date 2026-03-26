// @unocss-include
import hljs from 'highlight.js'

const COPY_CODE_LABEL = '复制'
const canonicalLanguageKeyByAlias = createCanonicalLanguageKeyByAlias()

/**
 * 若字符串以```结尾，则删除最后3个字符
 */
function removeTripleBackticks(inputString) {
  return inputString.endsWith('```') ? inputString.slice(0, -3) : inputString
}

function strToBase64(str) {
  const bytes = new TextEncoder().encode(str)
  const binString = String.fromCodePoint(...bytes)
  return btoa(binString)
}

function createCopyCodeKeydownHandler(encodedCode) {
  return `if(event.key==='Enter'||event.key===' '){event.preventDefault();copyCode('${encodedCode}')}`
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
 * 解析普通 fenced code block 的语言元数据
 */
function resolveCodeBlockLanguageMeta(info, code) {
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
      highlightedValue: canonicalKey
        ? hljs.highlight(code, { language: canonicalKey, ignoreIllegals: true }).value
        : hljs.highlightAuto(code).value,
      toolbarLangLabel: explicitLabel,
      toolbarLangHidden: false,
    }
  }

  const autoHighlightResult = hljs.highlightAuto(code)
  const codeClassNames = ['hljs']

  if (autoHighlightResult.language) {
    codeClassNames.push(`language-${autoHighlightResult.language}`)
  }

  return {
    codeClassName: codeClassNames.join(' '),
    highlightedValue: autoHighlightResult.value,
    toolbarLangLabel: '',
    toolbarLangHidden: true,
  }
}

function createFallbackCodeBlockLanguageMeta(info, code, md) {
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
      highlightedValue: md.utils.escapeHtml(code),
      toolbarLangLabel: explicitLabel,
      toolbarLangHidden: false,
    }
  }

  return {
    codeClassName: 'hljs',
    highlightedValue: md.utils.escapeHtml(code),
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

function renderStandardCodeBlockHtml(token, encodedCode, languageMeta, md) {
  const preAttrs = parseAttrs(token.attrs)
  const escapedToolbarLabel = md.utils.escapeHtml(languageMeta.toolbarLangLabel)

  return html`
  <div class="pre-container">
    <div class="pre-container-toolbar">
      <div class="pre-container-action-slot flex items-center w-full">
        <div class="font-bold op-80 pre-container-lang font-size-3 line-height-3 ${languageMeta.toolbarLangHidden ? 'hidden' : ''}">${escapedToolbarLabel}</div>
        <div class="i-tabler:copy cursor-pointer op-80 pre-container-copy font-size-3.5 hover:op-100" role="button" tabindex="0" title="${COPY_CODE_LABEL}" aria-label="${COPY_CODE_LABEL}" onclick="copyCode('${encodedCode}')" onkeydown="${createCopyCodeKeydownHandler(encodedCode)}"></div>
      </div>
    </div>
    <pre${preAttrs ? ` ${preAttrs}` : ''}>
      <code class="${languageMeta.codeClassName}">`
      + languageMeta.highlightedValue
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
    const encodedCode = strToBase64(code)
    if (lang === 'mermaid') {
      const content = removeTripleBackticks(code)
      return `<pre class="mermaid" data-code="${content.replace(/\s/g, '')}" ${parseAttrs(token.attrs)}>\n${content}\n</pre>\n`
    } else {
      try {
        const languageMeta = resolveCodeBlockLanguageMeta(info, code)
        return renderStandardCodeBlockHtml(token, encodedCode, languageMeta, md)
      } catch (e) {
        console.error(e)
        return renderStandardCodeBlockHtml(token, encodedCode, createFallbackCodeBlockLanguageMeta(info, code, md), md)
      }
    }
  }
}
