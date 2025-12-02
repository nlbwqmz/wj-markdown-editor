import commonUtil from '@/util/commonUtil.js'

/**
 * 给本地图片加上自定义协议
 */
export default function (md) {
  md.renderer.rules.image = (tokens, idx, options, env, slf) => {
    const token = tokens[idx]
    // "alt" attr MUST be set, even if empty. Because it's mandatory and
    // should be placed on proper position for tests.
    //
    // Replace content with actual value
    token.attrs[token.attrIndex('alt')][1] = slf.renderInlineAsText(token.children, options, env)
    if (token.attrs) {
      const srcIndex = token.attrs.findIndex(item => item && item[0] === 'src')
      if (srcIndex > -1) {
        const src = token.attrs[srcIndex][1]
        if (src) {
          if (!src.match('^http') && !src.match('^data')) {
            token.attrs[srcIndex][1] = `wj:///${commonUtil.stringToHex(src)}?wj_date=${Date.now()}`
          }
        }
      }
    }
    return slf.renderToken(tokens, idx, options)
  }
}
