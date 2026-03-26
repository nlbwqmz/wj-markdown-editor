/**
 * 添加原始文本对应的行号区域
 */
function normalizeTokenMap(map) {
  const [start, end] = map
  const lineStart = start + 1
  // 定义列表术语等场景会给出零跨度 map，此时结束行也应落在当前可见行。
  const lineEnd = Math.max(end, lineStart)
  return {
    lineStart,
    lineEnd,
  }
}

function resolveDefinitionDescriptionRange(tokens, tokenIndex) {
  const token = tokens[tokenIndex]
  if (token?.type !== 'dd_open' || token.nesting !== 1) {
    return null
  }

  let firstMappedChild = null
  let lastMappedChild = null

  for (let index = tokenIndex + 1; index < tokens.length; index++) {
    const currentToken = tokens[index]
    if (
      currentToken.tag === token.tag
      && currentToken.nesting === -1
      && currentToken.level === token.level
    ) {
      break
    }

    if (!currentToken.map || currentToken.level <= token.level) {
      continue
    }

    firstMappedChild ??= currentToken
    lastMappedChild = currentToken
  }

  if (!firstMappedChild || !lastMappedChild) {
    return null
  }

  return {
    lineStart: normalizeTokenMap(firstMappedChild.map).lineStart,
    lineEnd: normalizeTokenMap(lastMappedChild.map).lineEnd,
  }
}

export default function (md) {
  md.core.ruler.push('line_number', (state) => {
    state.tokens.forEach((token, tokenIndex) => {
      if (token.map) {
        const lineRange = resolveDefinitionDescriptionRange(state.tokens, tokenIndex) ?? normalizeTokenMap(token.map)
        // 用户可见的行号从 1 开始，且闭开区间需转换为闭区间
        token.attrSet('data-line-start', String(lineRange.lineStart))
        token.attrSet('data-line-end', String(lineRange.lineEnd))
      }
    })
  })
}
