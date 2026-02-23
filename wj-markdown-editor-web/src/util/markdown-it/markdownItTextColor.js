/**
 * 文字颜色
 */
export default function (md) {
  md.inline.ruler.push('text_color', (state, silent) => {
    const start = state.pos

    // 检查是否以左花括号 { 开始（0x7B 是 { 的字符码）
    if (state.src.charCodeAt(start) !== 0x7B)
      return false

    // 先匹配 {color}( 部分，提取颜色值
    // 正则：^\{([^}]+)\}\( 匹配 {任意非}字符}(
    const colorMatch = state.src.slice(start).match(/^\{([^}]+)\}\(/)
    if (!colorMatch)
      return false

    // 查找匹配的右括号，支持嵌套括号
    // 例如：{red}(123()) 应该匹配到最外层的右括号
    const textStart = start + colorMatch[0].length // 文本内容的起始位置
    let depth = 1 // 括号深度计数器，初始为1（因为已经遇到了第一个左括号）
    let pos = textStart

    // 遍历字符串，通过计数括号来找到匹配的右括号
    while (pos < state.src.length && depth > 0) {
      if (state.src.charCodeAt(pos) === 0x28)
        depth++ // 遇到 ( 则深度+1
      else if (state.src.charCodeAt(pos) === 0x29)
        depth-- // 遇到 ) 则深度-1
      pos++
    }

    // 如果深度不为0，说明括号不匹配
    if (depth !== 0)
      return false

    // 提取颜色和文本内容
    const color = colorMatch[1] // 颜色值
    const text = state.src.slice(textStart, pos - 1) // 文本内容（不包含最后的右括号）
    const match = [state.src.slice(start, pos), color, text] // 构造匹配结果数组

    if (!silent) {
      // 创建 HTML 内联标签
      const token = state.push('html_inline', '', 0)
      const color = match[1] // 从匹配结果中获取颜色
      const text = match[2] // 从匹配结果中获取文本

      // 判断是否为渐变色（包含 'gradient' 关键字）
      if (color.includes('gradient')) {
        // 渐变色使用特殊的 CSS 类
        token.content = `<span class="markdown-it-text-color-gradient" style="--markdown-it-text-color: ${color}">${md.renderInline(text)}</span>`
      } else {
        // 普通颜色使用标准 CSS 类
        token.content = `<span class="markdown-it-text-color" style="--markdown-it-text-color: ${color}">${md.renderInline(text)}</span>`
      }
    }

    // 更新解析位置到匹配内容的末尾
    state.pos += match[0].length
    return true
  })
}
