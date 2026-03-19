import commonUtil from '@/util/commonUtil.js'
import {
  normalizeLocalResourcePath,
  normalizeMarkdownAnchorHref,
  shouldOpenMarkdownLinkInNewWindow,
} from '@/util/resourceUrlUtil.js'

/**
 * 给链接加上_blank
 */
export default function (md) {
  const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const hrefIndex = tokens[idx].attrIndex('href')
    if (hrefIndex >= 0) {
      const href = tokens[idx].attrs[hrefIndex][1]
      if (href) {
        if (href.startsWith('#')) {
          tokens[idx].attrs[hrefIndex][1] = normalizeMarkdownAnchorHref(href)
          const targetIndex = tokens[idx].attrIndex('target')
          if (targetIndex >= 0) {
            tokens[idx].attrs.splice(targetIndex, 1)
          }
          return defaultRender(tokens, idx, options, env, self)
        }

        if (shouldOpenMarkdownLinkInNewWindow(href)) {
          const targetIndex = tokens[idx].attrIndex('target')
          if (targetIndex < 0) {
            // 非锚点链接继续沿用新窗口打开策略，避免打断现有外链与资源打开体验。
            tokens[idx].attrPush(['target', '_blank'])
          } else {
            tokens[idx].attrs[targetIndex][1] = '_blank'
          }
        }

        const normalizedHref = normalizeLocalResourcePath(href)
        const convertedHref = commonUtil.convertResourceUrl(normalizedHref)
        tokens[idx].attrs[hrefIndex][1] = convertedHref
        if (convertedHref.startsWith('wj://')) {
          tokens[idx].attrSet('data-wj-resource-kind', 'link')
          tokens[idx].attrSet('data-wj-resource-src', normalizedHref)
          tokens[idx].attrSet('data-wj-resource-raw', href)
        }
      }
    }
    // pass token to default renderer.
    return defaultRender(tokens, idx, options, env, self)
  }
}
