import commonUtil from '@/util/commonUtil.js'

/**
 * 给链接加上_blank
 */
export default function (md) {
  const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    // If you are sure other plugins can't add `target` - drop check below
    const targetIndex = tokens[idx].attrIndex('target')
    if (targetIndex < 0) {
      // add new attribute
      tokens[idx].attrPush(['target', '_blank'])
    } else {
      // replace value of existing attr
      tokens[idx].attrs[targetIndex][1] = '_blank'
    }

    const hrefIndex = tokens[idx].attrIndex('href')
    if (hrefIndex >= 0) {
      // add new attribute
      const href = tokens[idx].attrs[hrefIndex][1]
      if (href && !href.match('^http')) {
        tokens[idx].attrs[hrefIndex][1] = `wj:///${commonUtil.stringToHex(href)}`
      }
    }
    // pass token to default renderer.
    return defaultRender(tokens, idx, options, env, self)
  }
}
