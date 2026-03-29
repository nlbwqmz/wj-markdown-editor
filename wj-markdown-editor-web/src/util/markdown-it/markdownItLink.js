import commonUtil from '@/util/commonUtil.js'
import {
  normalizeLocalResourcePath,
  normalizeMarkdownAnchorHref,
  shouldOpenMarkdownLinkInNewWindow,
} from '@/util/resourceUrlUtil.js'

const HTTP_RESOURCE_REGEXP = /^https?:\/\//iu
const DATA_RESOURCE_REGEXP = /^data:/iu

function ensureTokenMeta(token) {
  if (!token.meta || typeof token.meta !== 'object') {
    token.meta = {}
  }
  return token.meta
}

function findFirstNewResourceTokenIndex(state, tokenStartIndex) {
  for (let i = tokenStartIndex; i < state.tokens.length; i++) {
    const token = state.tokens[i]
    if (token?.type === 'image' || token?.type === 'link_open') {
      return i
    }
  }

  return -1
}

function resolveMarkdownReferenceFromNewTokens(state, tokenIndex, startPos) {
  const token = state.tokens[tokenIndex]
  if (!token) {
    return null
  }

  if (token.type === 'link_open' && token.markup === 'linkify') {
    const textToken = state.tokens[tokenIndex + 1]
    return typeof textToken?.content === 'string' && textToken.content
      ? textToken.content
      : null
  }

  if (token.type === 'link_open' && token.markup === 'autolink') {
    const textToken = state.tokens[tokenIndex + 1]
    return typeof textToken?.content === 'string' && textToken.content
      ? `<${textToken.content}>`
      : null
  }

  return state.src.slice(startPos, state.pos) || null
}

function wrapInlineRuleWithMarkdownReference(rule) {
  if (typeof rule !== 'function') {
    return rule
  }

  return function wrappedInlineRule(state, silent) {
    const tokenStartIndex = state.tokens.length
    const startPos = state.pos
    const matched = rule(state, silent)

    if (matched !== true || silent === true || state.pos <= startPos) {
      return matched
    }

    const resourceTokenIndex = findFirstNewResourceTokenIndex(state, tokenStartIndex)
    if (resourceTokenIndex === -1) {
      return matched
    }

    // 直接绑定到 markdown-it 本次实际生成的 token，
    // 这样 code span、转义字符、autolink 与 linkify 的语法边界都会和真实渲染结果保持一致。
    setPreviewTokenMarkdownReference(
      state.tokens[resourceTokenIndex],
      resolveMarkdownReferenceFromNewTokens(state, resourceTokenIndex, startPos),
    )
    return matched
  }
}

function getInlineRuleByName(ruler, ruleName) {
  return ruler?.__rules__?.find(rule => rule.name === ruleName)?.fn || null
}

export function setPreviewTokenMarkdownReference(token, markdownReference) {
  if (typeof markdownReference !== 'string' || !markdownReference) {
    return
  }
  ensureTokenMeta(token).wjMarkdownReference = markdownReference
}

export function getPreviewTokenMarkdownReference(token) {
  const markdownReference = token?.meta?.wjMarkdownReference
  return typeof markdownReference === 'string' && markdownReference
    ? markdownReference
    : null
}

export function resolvePreviewResourceMetadata(rawSource) {
  const normalizedSource = normalizeLocalResourcePath(rawSource)
  if (!normalizedSource || normalizedSource.startsWith('#') || normalizedSource.startsWith('//') || DATA_RESOURCE_REGEXP.test(normalizedSource)) {
    return null
  }

  const convertedSource = commonUtil.convertResourceUrl(normalizedSource)
  const isLocalResource = convertedSource.startsWith('wj://')
  const isRemoteResource = HTTP_RESOURCE_REGEXP.test(normalizedSource)
  if (!isLocalResource && !isRemoteResource) {
    return null
  }

  return {
    normalizedSource,
    convertedSource: isLocalResource ? convertedSource : normalizedSource,
    isLocalResource,
    isRemoteResource,
  }
}

/**
 * 给链接加上_blank
 */
export default function (md) {
  const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }
  const originalLinkRule = getInlineRuleByName(md.inline.ruler, 'link')
  const originalImageRule = getInlineRuleByName(md.inline.ruler, 'image')
  const originalAutolinkRule = getInlineRuleByName(md.inline.ruler, 'autolink')
  const originalLinkifyRule = getInlineRuleByName(md.inline.ruler, 'linkify')

  md.inline.ruler.at('link', wrapInlineRuleWithMarkdownReference(originalLinkRule))
  md.inline.ruler.at('image', wrapInlineRuleWithMarkdownReference(originalImageRule))
  md.inline.ruler.at('autolink', wrapInlineRuleWithMarkdownReference(originalAutolinkRule))
  md.inline.ruler.at('linkify', wrapInlineRuleWithMarkdownReference(originalLinkifyRule))

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

        const resourceMetadata = resolvePreviewResourceMetadata(href)
        if (resourceMetadata) {
          tokens[idx].attrs[hrefIndex][1] = resourceMetadata.convertedSource
          tokens[idx].attrSet('data-wj-resource-kind', 'link')
          tokens[idx].attrSet('data-wj-resource-src', resourceMetadata.normalizedSource)
          tokens[idx].attrSet('data-wj-resource-raw', href)
          const markdownReference = getPreviewTokenMarkdownReference(tokens[idx])
          if (markdownReference) {
            tokens[idx].attrSet('data-wj-markdown-reference', markdownReference)
          }
        } else {
          const normalizedHref = normalizeLocalResourcePath(href)
          tokens[idx].attrs[hrefIndex][1] = commonUtil.convertResourceUrl(normalizedHref)
        }
      }
    }
    // pass token to default renderer.
    return defaultRender(tokens, idx, options, env, self)
  }
}
