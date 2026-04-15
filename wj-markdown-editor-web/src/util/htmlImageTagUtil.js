const HTML_COMMENT_REGEXP = /<!--[\s\S]*?-->/gu
const HTML_RAW_TEXT_ELEMENT_REGEXP = /<(script|style|textarea|title|template|noscript)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/giu
const HTML_IMAGE_TAG_START_REGEXP = /^<img(?=[\s/>])/iu

const HTML_NAMED_ENTITY_MAP = {
  amp: '&',
  apos: '\'',
  gt: '>',
  lt: '<',
  nbsp: '\u00A0',
  quot: '"',
}

function decodeHtmlAttributeValue(value) {
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z][\w:-]*);/giu, (entityText, entityBody) => {
    const normalizedEntityBody = String(entityBody)
    if (/^#x[\da-f]+$/iu.test(normalizedEntityBody)) {
      const codePoint = Number.parseInt(normalizedEntityBody.slice(2), 16)
      return Number.isNaN(codePoint) ? entityText : String.fromCodePoint(codePoint)
    }

    if (/^#\d+$/u.test(normalizedEntityBody)) {
      const codePoint = Number.parseInt(normalizedEntityBody.slice(1), 10)
      return Number.isNaN(codePoint) ? entityText : String.fromCodePoint(codePoint)
    }

    return HTML_NAMED_ENTITY_MAP[normalizedEntityBody.toLowerCase()] ?? entityText
  })
}

function buildHtmlCommentRangeList(content) {
  return Array.from(content.matchAll(HTML_COMMENT_REGEXP), (match) => {
    const start = match.index ?? 0
    return {
      start,
      end: start + match[0].length,
    }
  })
}

function buildHtmlLiteralIgnoreRangeList(content) {
  const rangeList = buildHtmlCommentRangeList(content)

  // script / style / template 等容器里的文本不会按真实 HTML 节点渲染，
  // 其中出现的 <img> 只能视为字面量，不能参与预览改写或删除匹配。
  for (const match of content.matchAll(HTML_RAW_TEXT_ELEMENT_REGEXP)) {
    const blockText = match[0]
    const blockStart = match.index ?? 0
    const openTagEndIndex = blockText.indexOf('>')
    const closeTagStartIndex = blockText.lastIndexOf('</')
    if (openTagEndIndex === -1 || closeTagStartIndex <= openTagEndIndex) {
      continue
    }

    rangeList.push({
      start: blockStart + openTagEndIndex + 1,
      end: blockStart + closeTagStartIndex,
    })
  }

  return rangeList
}

function isRangeInsideIgnoredLiteral(rangeList, start, end) {
  return rangeList.some(range => start >= range.start && end <= range.end)
}

function sortRangeList(rangeList) {
  return [...rangeList].sort((rangeA, rangeB) => rangeA.start - rangeB.start)
}

function findHtmlTagEnd(content, startIndex) {
  let quote = null

  for (let i = startIndex + 1; i < content.length; i++) {
    const currentChar = content[i]
    if (quote) {
      if (currentChar === quote) {
        quote = null
      }
      continue
    }

    if (currentChar === '"' || currentChar === '\'') {
      quote = currentChar
      continue
    }

    if (currentChar === '>') {
      return i
    }
  }

  return -1
}

function isNativeHtmlImageTagStart(content, startIndex) {
  return HTML_IMAGE_TAG_START_REGEXP.test(content.slice(startIndex))
}

function isHtmlWhitespaceChar(char) {
  return /\s/u.test(char)
}

function skipHtmlWhitespace(content, startIndex) {
  let currentIndex = startIndex
  while (currentIndex < content.length && isHtmlWhitespaceChar(content[currentIndex])) {
    currentIndex += 1
  }
  return currentIndex
}

function readHtmlAttributeName(content, startIndex) {
  let currentIndex = startIndex
  while (currentIndex < content.length && !/[\s=/>"'`<]/u.test(content[currentIndex])) {
    currentIndex += 1
  }

  if (currentIndex <= startIndex) {
    return null
  }

  return {
    name: content.slice(startIndex, currentIndex),
    nextIndex: currentIndex,
  }
}

function readHtmlAttributeValue(content, startIndex) {
  if (startIndex >= content.length) {
    return {
      rawValueText: '',
      quote: '"',
      nextIndex: startIndex,
    }
  }

  const openingChar = content[startIndex]
  if (openingChar === '"' || openingChar === '\'') {
    const closingIndex = content.indexOf(openingChar, startIndex + 1)
    if (closingIndex === -1) {
      return null
    }

    return {
      rawValueText: content.slice(startIndex + 1, closingIndex),
      quote: openingChar,
      nextIndex: closingIndex + 1,
    }
  }

  let currentIndex = startIndex
  while (currentIndex < content.length && !isHtmlWhitespaceChar(content[currentIndex])) {
    currentIndex += 1
  }

  return {
    rawValueText: content.slice(startIndex, currentIndex),
    quote: null,
    nextIndex: currentIndex,
  }
}

function parseHtmlImageAttributeSource(attributeSource) {
  const attributes = []
  let currentIndex = 0
  let selfClosing = false

  while (currentIndex < attributeSource.length) {
    currentIndex = skipHtmlWhitespace(attributeSource, currentIndex)
    if (currentIndex >= attributeSource.length) {
      break
    }

    if (attributeSource[currentIndex] === '/') {
      if (attributeSource.slice(currentIndex + 1).trim()) {
        return null
      }

      selfClosing = true
      break
    }

    const attributeNameResult = readHtmlAttributeName(attributeSource, currentIndex)
    if (!attributeNameResult) {
      return null
    }

    currentIndex = skipHtmlWhitespace(attributeSource, attributeNameResult.nextIndex)
    let hasValue = false
    let rawValueText = ''
    let quote = '"'

    if (attributeSource[currentIndex] === '=') {
      hasValue = true
      currentIndex = skipHtmlWhitespace(attributeSource, currentIndex + 1)
      const attributeValueResult = readHtmlAttributeValue(attributeSource, currentIndex)
      if (!attributeValueResult) {
        return null
      }

      rawValueText = attributeValueResult.rawValueText
      quote = attributeValueResult.quote
      currentIndex = attributeValueResult.nextIndex
    }

    attributes.push({
      name: attributeNameResult.name,
      value: hasValue ? decodeHtmlAttributeValue(rawValueText) : '',
      hasValue,
      quote,
      rawValueText,
      valueChanged: false,
    })
  }

  return {
    attributes,
    selfClosing,
  }
}

/**
 * 转义 HTML 属性值，避免重建标签时破坏原有结构。
 * @param {string} value - 原始属性值
 * @param {'"' | "'"} quote - 当前属性使用的引号类型
 * @returns {string} 转义后的属性值
 */
function escapeHtmlAttributeValue(value, quote) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(quote === '"' ? /"/g : /'/g, quote === '"' ? '&quot;' : '&#39;')
}

/**
 * 解析单个 HTML img 标签，保留属性顺序与引号风格。
 * @param {string} tagText - 原始 img 标签文本
 * @returns {{ tagName: 'img', selfClosing: boolean, attributes: Array<{ name: string, value: string, hasValue: boolean, quote: '"' | "'" | null, rawValueText: string, valueChanged: boolean }> } | null} 解析成功时返回结构化标签信息，否则返回 null
 */
export function parseHtmlImageTag(tagText) {
  if (typeof tagText !== 'string') {
    return null
  }

  const tagMatch = /^<img(?=[\s/>])([\s\S]*?)>$/iu.exec(tagText.trim())
  if (!tagMatch) {
    return null
  }

  const [, attributeSource] = tagMatch
  const parsedAttributeSource = parseHtmlImageAttributeSource(attributeSource)
  if (!parsedAttributeSource) {
    return null
  }

  return {
    tagName: 'img',
    selfClosing: parsedAttributeSource.selfClosing,
    attributes: parsedAttributeSource.attributes,
  }
}

/**
 * 读取 img 标签上的指定属性值。
 * @param {{ attributes?: Array<{ name: string, value: string }> } | null} parsedTag - 已解析的 img 标签
 * @param {string} attributeName - 属性名
 * @returns {string | null} 属性值
 */
export function getHtmlImageAttribute(parsedTag, attributeName) {
  const normalizedAttributeName = String(attributeName || '').toLowerCase()
  const matchedAttribute = parsedTag?.attributes?.find(attribute => attribute.name.toLowerCase() === normalizedAttributeName)
  return matchedAttribute?.hasValue ? matchedAttribute.value : null
}

/**
 * 设置 img 标签属性，存在则覆盖，不存在则追加。
 * @param {{ attributes?: Array<{ name: string, value: string, hasValue: boolean, quote: '"' | "'" | null, rawValueText: string, valueChanged: boolean }> } | null} parsedTag - 已解析的 img 标签
 * @param {string} attributeName - 属性名
 * @param {string} attributeValue - 属性值
 */
export function setHtmlImageAttribute(parsedTag, attributeName, attributeValue) {
  if (!parsedTag?.attributes) {
    return
  }

  const normalizedAttributeName = String(attributeName || '').toLowerCase()
  const matchedAttribute = parsedTag.attributes.find(attribute => attribute.name.toLowerCase() === normalizedAttributeName)
  if (matchedAttribute) {
    matchedAttribute.value = String(attributeValue)
    matchedAttribute.hasValue = true
    matchedAttribute.quote = matchedAttribute.quote ?? '"'
    matchedAttribute.valueChanged = true
    return
  }

  parsedTag.attributes.push({
    name: attributeName,
    value: String(attributeValue),
    hasValue: true,
    quote: '"',
    rawValueText: '',
    valueChanged: true,
  })
}

/**
 * 将解析后的 img 标签重新拼接为 HTML 文本。
 * @param {{ selfClosing?: boolean, attributes?: Array<{ name: string, value: string, hasValue: boolean, quote: '"' | "'" | null, rawValueText: string, valueChanged: boolean }> } | null} parsedTag - 已解析的 img 标签
 * @returns {string} 重建后的标签文本
 */
export function stringifyHtmlImageTag(parsedTag) {
  if (!parsedTag?.attributes) {
    return ''
  }

  const attributeText = parsedTag.attributes.map((attribute) => {
    if (attribute.hasValue !== true) {
      return ` ${attribute.name}`
    }

    if (attribute.valueChanged !== true) {
      if (attribute.quote === null) {
        return ` ${attribute.name}=${attribute.rawValueText}`
      }

      const preservedQuote = attribute.quote === '\'' ? '\'' : '"'
      return ` ${attribute.name}=${preservedQuote}${attribute.rawValueText}${preservedQuote}`
    }

    const quote = attribute.quote === '\'' ? '\'' : '"'
    return ` ${attribute.name}=${quote}${escapeHtmlAttributeValue(attribute.value, quote)}${quote}`
  }).join('')

  return `<img${attributeText}${parsedTag.selfClosing === true ? ' />' : '>'}`
}

/**
 * 仅遍历并替换 HTML 片段里的 img 标签，其他标签保持原样。
 * @param {string} content - 待处理的 HTML 文本
 * @param {(options: { tagText: string, start: number, end: number, parsedTag: { tagName: 'img', selfClosing: boolean, attributes: Array<{ name: string, value: string, hasValue: boolean, quote: '"' | "'" | null, rawValueText: string, valueChanged: boolean }> } }) => string} replacer - 替换器
 * @returns {string} 替换后的 HTML 文本
 */
export function replaceHtmlImageTags(content, replacer) {
  if (typeof content !== 'string' || typeof replacer !== 'function') {
    return content
  }

  let nextContent = ''
  let lastIndex = 0
  const ignoredLiteralRangeList = sortRangeList(buildHtmlLiteralIgnoreRangeList(content))
  let ignoredLiteralRangeIndex = 0
  let searchIndex = 0

  while (searchIndex < content.length) {
    while (
      ignoredLiteralRangeIndex < ignoredLiteralRangeList.length
      && searchIndex >= ignoredLiteralRangeList[ignoredLiteralRangeIndex].end
    ) {
      ignoredLiteralRangeIndex += 1
    }

    const currentIgnoredLiteralRange = ignoredLiteralRangeList[ignoredLiteralRangeIndex]
    if (
      currentIgnoredLiteralRange
      && searchIndex >= currentIgnoredLiteralRange.start
      && searchIndex < currentIgnoredLiteralRange.end
    ) {
      searchIndex = currentIgnoredLiteralRange.end
      continue
    }

    const tagStartIndex = content.indexOf('<', searchIndex)
    if (tagStartIndex === -1) {
      break
    }

    searchIndex = tagStartIndex

    const tagEndIndex = findHtmlTagEnd(content, tagStartIndex)
    if (tagEndIndex === -1) {
      break
    }

    const end = tagEndIndex + 1
    if (isRangeInsideIgnoredLiteral(ignoredLiteralRangeList, tagStartIndex, end)) {
      searchIndex = end
      continue
    }

    const tagText = content.slice(tagStartIndex, end)
    if (!isNativeHtmlImageTagStart(content, tagStartIndex)) {
      searchIndex = end
      continue
    }

    const parsedTag = parseHtmlImageTag(tagText)

    nextContent += content.slice(lastIndex, tagStartIndex)
    if (!parsedTag) {
      nextContent += tagText
    } else {
      nextContent += replacer({
        tagText,
        start: tagStartIndex,
        end,
        parsedTag,
      })
    }
    lastIndex = end
    searchIndex = end
  }

  if (lastIndex === 0) {
    return content
  }

  nextContent += content.slice(lastIndex)
  return nextContent
}

/**
 * 收集 HTML 文本里全部 img 标签及其位置信息，供删除引用链路复用。
 * @param {string} content - Markdown 原文中的 HTML 片段
 * @returns {Array<{ tagText: string, start: number, end: number, parsedTag: { tagName: 'img', selfClosing: boolean, attributes: Array<{ name: string, value: string, hasValue: boolean, quote: '"' | "'" | null, rawValueText: string, valueChanged: boolean }> } }>} img 标签列表
 */
export function collectHtmlImageTags(content) {
  const tagList = []

  replaceHtmlImageTags(content, ({ tagText, start, end, parsedTag }) => {
    tagList.push({
      tagText,
      start,
      end,
      parsedTag,
    })
    return tagText
  })

  return tagList
}

export default {
  collectHtmlImageTags,
  getHtmlImageAttribute,
  parseHtmlImageTag,
  replaceHtmlImageTags,
  setHtmlImageAttribute,
  stringifyHtmlImageTag,
}
