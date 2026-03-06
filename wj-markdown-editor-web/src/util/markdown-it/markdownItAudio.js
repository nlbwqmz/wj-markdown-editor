import commonUtil from '@/util/commonUtil.js'

/**
 * 音频插件 !audio(...)
 */
export default function (md) {
  const audioRegex = /^!audio\(([^)]+)\)/i

  // 添加行内规则
  md.inline.ruler.push('audio', (state, silent) => {
    const startPos = state.pos

    if (state.src.charCodeAt(startPos) !== 0x21 /* ! */)
      return false
    const match = audioRegex.exec(state.src.slice(startPos))
    if (!match)
      return false

    // 非静默模式时创建 token
    if (!silent) {
      const token = state.push('audio', '', 0)
      token.content = match[1].trim() // 提取音频地址
      token.level = state.level
    }

    // 更新解析位置
    state.pos += match[0].length
    return true
  })

  // 渲染音频标签
  md.renderer.rules.audio = (tokens, idx) => {
    const src = commonUtil.convertResourceUrl(md.utils.escapeHtml(tokens[idx].content))

    return `<audio src="${src}" controls style="max-width: 100%"></audio>`
  }
}
