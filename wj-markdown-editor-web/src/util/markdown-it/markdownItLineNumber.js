/**
 * 添加原始文本对应的行号区域
 */
export default function (md) {
  md.core.ruler.push('line_number', (state) => {
    state.tokens.forEach((token) => {
      if (token.map) {
        // 闭开区间
        const [start, end] = token.map
        // 用户可见的行号从 1 开始，且闭开区间需转换为闭区间
        token.attrSet('data-line-start', String(start + 1))
        token.attrSet('data-line-end', String(end))
      }
    })
  })
}
