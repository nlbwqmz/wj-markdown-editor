import commonUtil from '@/util/commonUtil.js'
import { normalizeLocalResourcePath } from '@/util/resourceUrlUtil.js'

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
      const href = tokens[idx].attrs[hrefIndex][1]
      if (href) {
        const normalizedHref = normalizeLocalResourcePath(href)
        const convertedHref = commonUtil.convertResourceUrl(normalizedHref)
        tokens[idx].attrs[hrefIndex][1] = convertedHref
        if (convertedHref.startsWith('wj://')) {
          tokens[idx].attrSet('data-wj-resource-kind', 'link')
          tokens[idx].attrSet('data-wj-resource-src', normalizedHref)
        }
      }
    }
    // pass token to default renderer.
    return defaultRender(tokens, idx, options, env, self)
  }
}
