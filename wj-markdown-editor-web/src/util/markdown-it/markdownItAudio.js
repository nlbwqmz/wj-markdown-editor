import commonUtil from '@/util/commonUtil.js'
import { normalizeLocalResourcePath } from '@/util/resourceUrlUtil.js'

function shouldEscapeMarkdownCharacter(nextChar) {
  return Boolean(nextChar) && /[()<>\\\s]/.test(nextChar)
}

function findClosingParenthesis(content, startIndex) {
  let escaped = false
  let inAngleBracket = false
  let nestedParenthesisDepth = 0

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && shouldEscapeMarkdownCharacter(content[i + 1])) {
      escaped = true
      continue
    }
    if (char === '<') {
      inAngleBracket = true
      continue
    }
    if (char === '>' && inAngleBracket) {
      inAngleBracket = false
      continue
    }
    if (!inAngleBracket && char === '(') {
      nestedParenthesisDepth += 1
      continue
    }
    if (char === ')' && !inAngleBracket) {
      if (nestedParenthesisDepth > 0) {
        nestedParenthesisDepth -= 1
        continue
      }
      return i
    }
  }

  return -1
}

/**
 * 音频插件 !audio(...)
 */
export default function (md) {
  const prefix = '!audio('

  // 添加行内规则
  md.inline.ruler.push('audio', (state, silent) => {
    const startPos = state.pos

    if (state.src.charCodeAt(startPos) !== 0x21 /* ! */)
      return false
    if (!state.src.slice(startPos).startsWith(prefix))
      return false

    const contentStart = startPos + prefix.length
    const endIndex = findClosingParenthesis(state.src, contentStart)
    if (endIndex === -1)
      return false

    // 非静默模式时创建 token
    if (!silent) {
      const token = state.push('audio', '', 0)
      token.content = state.src.slice(contentStart, endIndex).trim() // 提取音频地址
      token.level = state.level
    }

    // 更新解析位置
    state.pos = endIndex + 1
    return true
  })

  // 渲染音频标签
  md.renderer.rules.audio = (tokens, idx) => {
    const rawSrc = tokens[idx].content.trim()
    const normalizedSrc = normalizeLocalResourcePath(rawSrc)
    const convertedSrc = commonUtil.convertResourceUrl(normalizedSrc)
    const isLocalResource = convertedSrc.startsWith('wj://')
    const resourceAttr = isLocalResource
      ? ` data-wj-resource-kind="audio" data-wj-resource-src="${md.utils.escapeHtml(normalizedSrc)}" data-wj-resource-raw="${md.utils.escapeHtml(rawSrc)}"`
      : ''

    return `<audio src="${md.utils.escapeHtml(convertedSrc)}" controls style="max-width: 100%"${resourceAttr}></audio>`
  }
}
