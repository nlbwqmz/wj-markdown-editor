import commonUtil from '@/util/commonUtil.js'
import { normalizeLocalResourcePath } from '@/util/resourceUrlUtil.js'
import { getPreviewTokenMarkdownReference, resolvePreviewResourceMetadata } from './markdownItLink.js'

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
          const resourceMetadata = resolvePreviewResourceMetadata(src)
          if (resourceMetadata) {
            token.attrSet('data-wj-resource-kind', 'image')
            token.attrSet('data-wj-resource-src', resourceMetadata.normalizedSource)
            token.attrSet('data-wj-resource-raw', src)
            const markdownReference = getPreviewTokenMarkdownReference(token)
            if (markdownReference) {
              token.attrSet('data-wj-markdown-reference', markdownReference)
            }
            if (resourceMetadata.isLocalResource) {
              token.attrs[srcIndex][1] = `${resourceMetadata.convertedSource}?wj_date=${Date.now()}`
            } else {
              token.attrs[srcIndex][1] = resourceMetadata.convertedSource
            }
          } else if (!src.match('^http') && !src.match('^data')) {
            const normalizedSrc = normalizeLocalResourcePath(src)
            token.attrs[srcIndex][1] = `${commonUtil.convertResourceUrl(normalizedSrc)}?wj_date=${Date.now()}`
          }
        }
      }
    }
    return slf.renderToken(tokens, idx, options)
  }
}
