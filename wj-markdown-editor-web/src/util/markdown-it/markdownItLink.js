import commonUtil from '@/util/commonUtil.js'
import {
  normalizeLocalResourcePath,
  normalizeMarkdownAnchorHref,
  shouldOpenMarkdownLinkInNewWindow,
} from '@/util/resourceUrlUtil.js'

const HTTP_RESOURCE_REGEXP = /^https?:\/\//iu
const DATA_RESOURCE_REGEXP = /^data:/iu

function shouldEscapeMarkdownCharacter(nextChar) {
  return Boolean(nextChar) && /[[\]()<>\\\s]/u.test(nextChar)
}

function ensureTokenMeta(token) {
  if (!token.meta || typeof token.meta !== 'object') {
    token.meta = {}
  }
  return token.meta
}

function findClosingSquareBracket(content, startIndex) {
  let escaped = false
  let nestedBracketDepth = 0

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && shouldEscapeMarkdownCharacter(content[i + 1])) {
      escaped = true
      continue
    }
    if (char === '[') {
      nestedBracketDepth += 1
      continue
    }
    if (char === ']') {
      if (nestedBracketDepth > 0) {
        nestedBracketDepth -= 1
        continue
      }
      return i
    }
  }

  return -1
}

function findClosingParenthesis(content, startIndex) {
  let escaped = false
  let inAngleBracket = false
  let nestedParenthesisDepth = 0

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && shouldEscapeMarkdownCharacter(content[i + 1])) {
      escaped = true
      continue
    }
    if (char === '<') {
      inAngleBracket = true
      continue
    }
    if (char === '>' && inAngleBracket) {
      inAngleBracket = false
      continue
    }
    if (!inAngleBracket && char === '(') {
      nestedParenthesisDepth += 1
      continue
    }
    if (char === ')' && !inAngleBracket) {
      if (nestedParenthesisDepth > 0) {
        nestedParenthesisDepth -= 1
        continue
      }
      return i
    }
  }

  return -1
}

function unescapeMarkdownDestination(destination) {
  return destination.replace(/\\([()[\]<>\\\s])/gu, '$1')
}

function extractMarkdownDestination(rawDestination) {
  const trimmedDestination = rawDestination.trim()
  if (!trimmedDestination) {
    return null
  }

  if (trimmedDestination.startsWith('<')) {
    const closingAngleIndex = trimmedDestination.indexOf('>')
    if (closingAngleIndex <= 0) {
      return null
    }
    return unescapeMarkdownDestination(trimmedDestination.slice(1, closingAngleIndex))
  }

  let escaped = false
  let nestedParenthesisDepth = 0

  for (let i = 0; i < trimmedDestination.length; i++) {
    const char = trimmedDestination[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && shouldEscapeMarkdownCharacter(trimmedDestination[i + 1])) {
      escaped = true
      continue
    }
    if (char === '(') {
      nestedParenthesisDepth += 1
      continue
    }
    if (char === ')' && nestedParenthesisDepth > 0) {
      nestedParenthesisDepth -= 1
      continue
    }
    if (/\s/u.test(char) && nestedParenthesisDepth === 0) {
      return unescapeMarkdownDestination(trimmedDestination.slice(0, i))
    }
  }

  return unescapeMarkdownDestination(trimmedDestination)
}

function parseBracketResourceReference(content, startIndex, type) {
  const prefix = type === 'image' ? '![' : '['
  if (!content.startsWith(prefix, startIndex)) {
    return null
  }

  const labelStartIndex = startIndex + prefix.length
  const labelEndIndex = findClosingSquareBracket(content, labelStartIndex)
  if (labelEndIndex === -1) {
    return null
  }

  let destinationOpenIndex = labelEndIndex + 1
  while (destinationOpenIndex < content.length && /\s/u.test(content[destinationOpenIndex])) {
    destinationOpenIndex += 1
  }
  if (content[destinationOpenIndex] !== '(') {
    return null
  }

  const destinationStartIndex = destinationOpenIndex + 1
  const destinationEndIndex = findClosingParenthesis(content, destinationStartIndex)
  if (destinationEndIndex === -1) {
    return null
  }

  const destination = extractMarkdownDestination(content.slice(destinationStartIndex, destinationEndIndex))
  if (!destination) {
    return null
  }

  return {
    type,
    source: destination,
    markdownReference: content.slice(startIndex, destinationEndIndex + 1),
    nextIndex: destinationEndIndex + 1,
  }
}

function parseAutolinkReference(content, startIndex) {
  if (content[startIndex] !== '<') {
    return null
  }

  const closingAngleIndex = content.indexOf('>', startIndex + 1)
  if (closingAngleIndex === -1) {
    return null
  }

  const destination = content.slice(startIndex + 1, closingAngleIndex)
  if (!HTTP_RESOURCE_REGEXP.test(destination)) {
    return null
  }

  return {
    type: 'link',
    source: destination,
    markdownReference: content.slice(startIndex, closingAngleIndex + 1),
    nextIndex: closingAngleIndex + 1,
  }
}

function parseLinkifyReference(content, startIndex) {
  const matchedUrl = /^https?:\/\/[^\s<]+/iu.exec(content.slice(startIndex))
  if (!matchedUrl) {
    return null
  }

  return {
    type: 'link',
    source: matchedUrl[0],
    markdownReference: matchedUrl[0],
    nextIndex: startIndex + matchedUrl[0].length,
  }
}

function extractInlineResourceReferenceList(content) {
  const referenceList = []
  let index = 0

  while (index < content.length) {
    const imageReference = parseBracketResourceReference(content, index, 'image')
    if (imageReference) {
      referenceList.push(imageReference)
      index = imageReference.nextIndex
      continue
    }

    const linkReference = parseBracketResourceReference(content, index, 'link')
    if (linkReference) {
      referenceList.push(linkReference)
      index = linkReference.nextIndex
      continue
    }

    const autolinkReference = parseAutolinkReference(content, index)
    if (autolinkReference) {
      referenceList.push(autolinkReference)
      index = autolinkReference.nextIndex
      continue
    }

    const linkifyReference = parseLinkifyReference(content, index)
    if (linkifyReference) {
      referenceList.push(linkifyReference)
      index = linkifyReference.nextIndex
      continue
    }

    index += 1
  }

  return referenceList
}

function takeNextInlineReference(referenceList, startIndex, type, source) {
  const normalizedSource = normalizeLocalResourcePath(source)
  for (let i = startIndex; i < referenceList.length; i++) {
    const reference = referenceList[i]
    if (reference.type !== type) {
      continue
    }
    if (normalizeLocalResourcePath(reference.source) !== normalizedSource) {
      continue
    }
    return {
      reference,
      nextIndex: i + 1,
    }
  }

  return {
    reference: null,
    nextIndex: startIndex,
  }
}

function annotateInlineResourceMarkdownReference(inlineToken) {
  if (!inlineToken?.content || !Array.isArray(inlineToken.children) || inlineToken.children.length === 0) {
    return
  }

  const referenceList = extractInlineResourceReferenceList(inlineToken.content)
  if (referenceList.length === 0) {
    return
  }

  let referenceCursor = 0
  inlineToken.children.forEach((childToken) => {
    if (childToken.type !== 'image' && childToken.type !== 'link_open') {
      return
    }

    const sourceAttrName = childToken.type === 'image' ? 'src' : 'href'
    const source = childToken.attrGet(sourceAttrName)
    if (!source) {
      return
    }

    const referenceType = childToken.type === 'image' ? 'image' : 'link'
    const { reference, nextIndex } = takeNextInlineReference(referenceList, referenceCursor, referenceType, source)
    if (!reference) {
      return
    }

    setPreviewTokenMarkdownReference(childToken, reference.markdownReference)
    referenceCursor = nextIndex
  })
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

  md.core.ruler.after('inline', 'preview-resource-markdown-reference', (state) => {
    state.tokens.forEach((token) => {
      if (token.type === 'inline') {
        annotateInlineResourceMarkdownReference(token)
      }
    })
  })

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
