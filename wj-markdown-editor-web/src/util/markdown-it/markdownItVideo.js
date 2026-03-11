import commonUtil from '@/util/commonUtil.js'

/**
 * 视频插件 !video(...)
 */
export default function (md) {
  const videoRegex = /^!video\(([^)]+)\)/i

  // 添加行内规则
  md.inline.ruler.push('video', (state, silent) => {
    const startPos = state.pos

    if (state.src.charCodeAt(startPos) !== 0x21 /* ! */)
      return false
    const match = videoRegex.exec(state.src.slice(startPos))
    if (!match)
      return false

    // 非静默模式时创建 token
    if (!silent) {
      const token = state.push('video', '', 0)
      token.content = match[1].trim() // 提取视频地址
      token.level = state.level
    }

    // 更新解析位置
    state.pos += match[0].length
    return true
  })

  // 渲染视频标签
  md.renderer.rules.video = (tokens, idx) => {
    const rawSrc = tokens[idx].content.trim()
    const convertedSrc = commonUtil.convertResourceUrl(md.utils.escapeHtml(rawSrc))
    const isLocalResource = convertedSrc.startsWith('wj://')
    const resourceAttr = isLocalResource
      ? ` data-wj-resource-kind="video" data-wj-resource-src="${md.utils.escapeHtml(rawSrc)}"`
      : ''

    return `<video src="${convertedSrc}" controls style="max-width: 100%"${resourceAttr}></video>`
  }
}
