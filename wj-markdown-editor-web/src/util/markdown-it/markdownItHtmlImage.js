import commonUtil from '@/util/commonUtil.js'
import {
  getHtmlImageAttribute,
  replaceHtmlImageTags,
  setHtmlImageAttribute,
  stringifyHtmlImageTag,
} from '@/util/htmlImageTagUtil.js'
import { normalizeLocalResourcePath } from '@/util/resourceUrlUtil.js'
import { resolvePreviewResourceMetadata } from './markdownItLink.js'

const HTML_RAW_TEXT_TAG_NAME_SET = new Set(['script', 'style', 'textarea', 'title', 'template', 'noscript'])
const HTML_RAW_TEXT_OPEN_TAG_REGEXP = /^<([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>$/iu
const HTML_RAW_TEXT_CLOSE_TAG_REGEXP = /^<\/([a-z][\w:-]*)\s*>$/iu

function resolveRawTextBoundaryToken(content) {
  const normalizedContent = String(content || '').trim()
  if (!normalizedContent) {
    return null
  }

  const closeTagMatch = HTML_RAW_TEXT_CLOSE_TAG_REGEXP.exec(normalizedContent)
  if (closeTagMatch) {
    const tagName = closeTagMatch[1].toLowerCase()
    return HTML_RAW_TEXT_TAG_NAME_SET.has(tagName)
      ? { type: 'close', tagName }
      : null
  }

  const openTagMatch = HTML_RAW_TEXT_OPEN_TAG_REGEXP.exec(normalizedContent)
  if (!openTagMatch || /\/\s*>$/u.test(normalizedContent)) {
    return null
  }

  const tagName = openTagMatch[1].toLowerCase()
  return HTML_RAW_TEXT_TAG_NAME_SET.has(tagName)
    ? { type: 'open', tagName }
    : null
}

/**
 * 仅接管原生 HTML img 标签，把本地资源改写为统一资源协议，并补齐预览资源元数据。
 * 其他 HTML 标签必须保持 markdown-it 原始输出，不允许在这里扩散处理范围。
 */
export default function (md) {
  const defaultHtmlInlineRender = md.renderer.rules.html_inline || ((tokens, idx) => tokens[idx].content)
  const defaultHtmlBlockRender = md.renderer.rules.html_block || ((tokens, idx) => tokens[idx].content)
  const inlineRawTextStateCache = new WeakMap()

  const rewriteHtmlImageTokenContent = (content, env) => {
    if (env?.manageHtmlImageResources === false) {
      return content
    }

    return replaceHtmlImageTags(content, ({ tagText, parsedTag }) => {
      const src = getHtmlImageAttribute(parsedTag, 'src')
      if (!src) {
        return tagText
      }

      const resourceMetadata = resolvePreviewResourceMetadata(src)
      if (resourceMetadata) {
        setHtmlImageAttribute(parsedTag, 'data-wj-resource-kind', 'image')
        setHtmlImageAttribute(parsedTag, 'data-wj-resource-src', resourceMetadata.normalizedSource)
        setHtmlImageAttribute(parsedTag, 'data-wj-resource-raw', src)
        setHtmlImageAttribute(parsedTag, 'data-wj-markdown-reference', tagText)
        setHtmlImageAttribute(
          parsedTag,
          'src',
          resourceMetadata.isLocalResource
            ? `${resourceMetadata.convertedSource}?wj_date=${Date.now()}`
            : resourceMetadata.convertedSource,
        )
        return stringifyHtmlImageTag(parsedTag)
      }

      const normalizedSrc = normalizeLocalResourcePath(src)
      const convertedSrc = commonUtil.convertResourceUrl(normalizedSrc)

      // fallback 只兜底仍能稳定收口到本地 wj 协议的来源；
      // 协议相对 URL、blob:file 等危险或不受支持来源必须保持原样，避免把可加载地址改坏。
      if (convertedSrc.startsWith('wj://')) {
        setHtmlImageAttribute(parsedTag, 'src', `${convertedSrc}?wj_date=${Date.now()}`)
        return stringifyHtmlImageTag(parsedTag)
      }

      return tagText
    })
  }

  const buildInlineRawTextStateList = (tokens) => {
    const stateList = Array.from({ length: tokens.length }).fill(false)
    const rawTextStack = []

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      stateList[i] = rawTextStack.length > 0

      if (token?.type !== 'html_inline') {
        continue
      }

      const boundaryToken = resolveRawTextBoundaryToken(token.content)
      if (!boundaryToken) {
        continue
      }

      if (rawTextStack.length > 0) {
        if (boundaryToken.type === 'close' && boundaryToken.tagName === rawTextStack[rawTextStack.length - 1]) {
          rawTextStack.pop()
        }
        continue
      }

      if (boundaryToken.type === 'open') {
        rawTextStack.push(boundaryToken.tagName)
      }
    }

    return stateList
  }

  const isHtmlInlineTokenInsideRawText = (tokens, idx) => {
    if (!Array.isArray(tokens) || idx < 0 || idx >= tokens.length) {
      return false
    }

    let stateList = inlineRawTextStateCache.get(tokens)
    if (!stateList) {
      stateList = buildInlineRawTextStateList(tokens)
      inlineRawTextStateCache.set(tokens, stateList)
    }

    return stateList[idx] === true
  }

  md.renderer.rules.html_inline = function (tokens, idx, options, env, self) {
    if (!isHtmlInlineTokenInsideRawText(tokens, idx)) {
      tokens[idx].content = rewriteHtmlImageTokenContent(tokens[idx].content, env)
    }
    return defaultHtmlInlineRender(tokens, idx, options, env, self)
  }

  md.renderer.rules.html_block = function (tokens, idx, options, env, self) {
    tokens[idx].content = rewriteHtmlImageTokenContent(tokens[idx].content, env)
    return defaultHtmlBlockRender(tokens, idx, options, env, self)
  }
}
