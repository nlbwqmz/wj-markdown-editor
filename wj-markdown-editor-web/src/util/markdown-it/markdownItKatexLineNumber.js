/**
 * 给 KaTeX 块级公式补充根节点行号属性。
 */
function getLineNumberAttrs(token) {
  const lineStart = token?.attrGet?.('data-line-start')
  if (!lineStart) {
    return ''
  }

  const lineEnd = token.attrGet('data-line-end') || lineStart
  return ` data-line-start="${lineStart}" data-line-end="${lineEnd}"`
}

function injectAttrsIntoRootTag(renderedHtml, attrsText) {
  if (!attrsText || /^<[^>]*\bdata-line-start=/u.test(renderedHtml)) {
    return renderedHtml
  }

  const rootTagEndIndex = renderedHtml.indexOf('>')
  if (rootTagEndIndex === -1) {
    return renderedHtml
  }

  return `${renderedHtml.slice(0, rootTagEndIndex)}${attrsText}${renderedHtml.slice(rootTagEndIndex)}`
}

export default function (md) {
  ;['math_block', 'math_inline_block', 'math_inline_bare_block'].forEach((ruleName) => {
    const originalRenderer = md.renderer.rules[ruleName]
    if (typeof originalRenderer !== 'function') {
      return
    }

    md.renderer.rules[ruleName] = function (tokens, idx, options, env, self) {
      const renderedHtml = originalRenderer.call(this, tokens, idx, options, env, self)
      const attrsText = getLineNumberAttrs(tokens[idx])
      return injectAttrsIntoRootTag(renderedHtml, attrsText)
    }
  })
}
