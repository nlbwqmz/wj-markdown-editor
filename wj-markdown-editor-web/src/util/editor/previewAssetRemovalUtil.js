import MarkdownIt from 'markdown-it'
import {
  collectHtmlImageTags,
  getHtmlImageAttribute,
} from '../htmlImageTagUtil.js'
import { shouldContinueMarkdownCleanup } from './previewAssetDeleteDecisionUtil.js'

const SOURCE_RANGE_META_KEY = 'wjSourceRange'
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

function isHtmlImageToken(token) {
  return token?.type === 'html_inline'
}

function isMarkdownAssetToken(token) {
  return token?.type === 'image' || token?.type === 'link_open'
}

function createMarkdownItAssetMatcher() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
  })

  const wrapInlineRuleWithSourceRange = (rule) => {
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

      for (let i = tokenStartIndex; i < state.tokens.length; i++) {
        const token = state.tokens[i]
        if (!isMarkdownAssetToken(token) && !isHtmlImageToken(token)) {
          continue
        }

        if (!token.meta || typeof token.meta !== 'object') {
          token.meta = {}
        }
        const linkifiedText = token.type === 'link_open' && token.markup === 'linkify'
          ? state.tokens[tokenStartIndex + 1]?.content
          : null
        const resolvedStartPos = typeof linkifiedText === 'string' && linkifiedText
          ? Math.max(0, state.pos - linkifiedText.length)
          : startPos
        token.meta[SOURCE_RANGE_META_KEY] = {
          from: resolvedStartPos,
          to: state.pos,
        }
        break
      }

      return matched
    }
  }

  const getInlineRuleByName = (ruleName) => {
    return md.inline.ruler.__rules__?.find(rule => rule.name === ruleName)?.fn || null
  }

  md.inline.ruler.at('link', wrapInlineRuleWithSourceRange(getInlineRuleByName('link')))
  md.inline.ruler.at('image', wrapInlineRuleWithSourceRange(getInlineRuleByName('image')))
  md.inline.ruler.at('autolink', wrapInlineRuleWithSourceRange(getInlineRuleByName('autolink')))
  md.inline.ruler.at('linkify', wrapInlineRuleWithSourceRange(getInlineRuleByName('linkify')))
  md.inline.ruler.at('html_inline', wrapInlineRuleWithSourceRange(getInlineRuleByName('html_inline')))

  return md
}

const markdownItAssetMatcher = createMarkdownItAssetMatcher()

function normalizeAssetPath(value) {
  if (!value) {
    return ''
  }
  const trimmedValue = value.trim()
  const unwrappedValue = trimmedValue.startsWith('<') && trimmedValue.endsWith('>')
    ? trimmedValue.slice(1, -1).trim()
    : trimmedValue
  let decodedValue = unwrappedValue
  try {
    decodedValue = decodeURIComponent(unwrappedValue)
  } catch {
    decodedValue = unwrappedValue
  }
  return decodedValue.replace(/\\/g, '/')
}

function buildLineStartIndexes(content) {
  const lineStartIndexes = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      lineStartIndexes.push(i + 1)
    }
  }
  return lineStartIndexes
}

function getLineNumberByIndex(lineStartIndexes, index) {
  let left = 0
  let right = lineStartIndexes.length - 1
  let target = 0

  while (left <= right) {
    const middle = Math.floor((left + right) / 2)
    if (lineStartIndexes[middle] <= index) {
      target = middle
      left = middle + 1
    } else {
      right = middle - 1
    }
  }

  return target + 1
}

function shouldEscapeMarkdownCharacter(nextChar) {
  return Boolean(nextChar) && /[()<>\\\s]/.test(nextChar)
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

function createAssetMatch(content, lineStartIndexes, kind, from, to, rawPath) {
  return {
    kind,
    from,
    to,
    rawPath,
    normalizedPath: normalizeAssetPath(rawPath),
    lineStart: getLineNumberByIndex(lineStartIndexes, from),
    lineEnd: getLineNumberByIndex(lineStartIndexes, Math.max(from, to - 1)),
  }
}

function isValidSourceRange(sourceRange) {
  return Boolean(sourceRange)
    && Number.isInteger(sourceRange.from)
    && Number.isInteger(sourceRange.to)
    && sourceRange.to > sourceRange.from
}

function findMatchingLinkCloseTokenIndex(tokenList, linkOpenIndex) {
  let depth = 0

  for (let i = linkOpenIndex; i < tokenList.length; i++) {
    const token = tokenList[i]
    if (token?.type === 'link_open') {
      depth += 1
      continue
    }
    if (token?.type === 'link_close') {
      depth -= 1
      if (depth === 0) {
        return i
      }
    }
  }

  return -1
}

function isIgnorableLinkWrapperToken(token) {
  if (!token) {
    return true
  }
  if (token.type === 'text') {
    return token.content.trim() === ''
  }
  return token.type === 'softbreak' || token.type === 'hardbreak'
}

function resolveWrappedImageRemovalSourceRange(tokenList, imageTokenIndex) {
  for (let i = imageTokenIndex - 1; i >= 0; i--) {
    const token = tokenList[i]
    if (token?.type !== 'link_open') {
      continue
    }

    const linkCloseIndex = findMatchingLinkCloseTokenIndex(tokenList, i)
    if (linkCloseIndex === -1 || linkCloseIndex <= imageTokenIndex) {
      continue
    }

    for (let childIndex = i + 1; childIndex < linkCloseIndex; childIndex++) {
      if (childIndex === imageTokenIndex) {
        continue
      }
      if (!isIgnorableLinkWrapperToken(tokenList[childIndex])) {
        return null
      }
    }

    const wrappedSourceRange = token.meta?.[SOURCE_RANGE_META_KEY]
    return isValidSourceRange(wrappedSourceRange)
      ? wrappedSourceRange
      : null
  }

  return null
}

function collectMarkdownItMatches(content, lineStartIndexes, kind) {
  const inlineTokenList = markdownItAssetMatcher.parseInline(content, {})
  const tokenList = inlineTokenList.flatMap(token => Array.isArray(token.children) ? token.children : [])
  const matchList = []

  for (let tokenIndex = 0; tokenIndex < tokenList.length; tokenIndex++) {
    const token = tokenList[tokenIndex]
    const isMatchedKind = kind === 'image'
      ? token?.type === 'image'
      : token?.type === 'link_open'
    if (!isMatchedKind) {
      continue
    }

    const sourceRange = kind === 'image'
      ? resolveWrappedImageRemovalSourceRange(tokenList, tokenIndex) || token?.meta?.[SOURCE_RANGE_META_KEY]
      : token?.meta?.[SOURCE_RANGE_META_KEY]
    if (!isValidSourceRange(sourceRange)) {
      continue
    }

    const rawPath = normalizeAssetPath(token.attrGet?.(kind === 'image' ? 'src' : 'href'))
    if (rawPath) {
      matchList.push(createAssetMatch(
        content,
        lineStartIndexes,
        kind,
        sourceRange.from,
        sourceRange.to,
        rawPath,
      ))
    }
  }

  return matchList
}

function collectImageMatches(content, lineStartIndexes) {
  return [
    ...collectMarkdownItMatches(content, lineStartIndexes, 'image'),
    ...collectHtmlImageMatches(content, lineStartIndexes),
  ].sort((a, b) => a.from - b.from)
}

function collectHtmlImageMatches(content, lineStartIndexes) {
  const matchList = []
  const tokenList = markdownItAssetMatcher.parse(content, {})
  const mappedScopeStack = []

  for (const token of tokenList) {
    if (token?.nesting === -1) {
      while (
        mappedScopeStack.length > 0
        && mappedScopeStack[mappedScopeStack.length - 1].level >= token.level
      ) {
        mappedScopeStack.pop()
      }
    }

    if (token?.nesting === 1) {
      const mappedRange = resolveMappedTokenRange(content, lineStartIndexes, token)
      if (mappedRange) {
        mappedScopeStack.push({
          ...mappedRange,
          cursor: 0,
          level: token.level,
        })
      }
    }

    if (token?.type === 'html_block' && Array.isArray(token.map)) {
      matchList.push(...collectHtmlImageMatchesFromHtmlBlockToken(content, lineStartIndexes, token))
      continue
    }

    if (token?.type === 'inline' && Array.isArray(token.children)) {
      matchList.push(...collectHtmlImageMatchesFromInlineToken(content, lineStartIndexes, token, mappedScopeStack))
    }
  }

  return matchList
}

function resolveMappedTokenRange(content, lineStartIndexes, token) {
  if (!Array.isArray(token?.map)) {
    return null
  }

  const start = lineStartIndexes[token.map[0]]
  if (!Number.isInteger(start)) {
    return null
  }

  const end = token.map[1] < lineStartIndexes.length
    ? lineStartIndexes[token.map[1]]
    : content.length

  return {
    start,
    end,
    content: content.slice(start, end),
  }
}

function collectHtmlImageMatchesFromTokenContent(content, lineStartIndexes, tokenContent, baseStartIndex) {
  return collectHtmlImageTags(tokenContent)
    .map((tag) => {
      const rawPath = normalizeAssetPath(getHtmlImageAttribute(tag.parsedTag, 'src'))
      if (!rawPath) {
        return null
      }

      return createAssetMatch(
        content,
        lineStartIndexes,
        'image',
        baseStartIndex + tag.start,
        baseStartIndex + tag.end,
        rawPath,
      )
    })
    .filter(Boolean)
}

function collectHtmlImageMatchesFromHtmlBlockToken(content, lineStartIndexes, token) {
  const mappedRange = resolveMappedTokenRange(content, lineStartIndexes, token)
  if (!mappedRange) {
    return []
  }

  return collectHtmlImageMatchesFromTokenContent(
    content,
    lineStartIndexes,
    mappedRange.content,
    mappedRange.start,
  )
}

function resolveInlineTokenSourceRangeFromMappedScope(scope, tokenContent) {
  if (!scope || !tokenContent) {
    return null
  }

  const relativeStart = scope.content.indexOf(tokenContent, scope.cursor)
  if (relativeStart === -1) {
    return null
  }

  scope.cursor = relativeStart + tokenContent.length
  return {
    start: scope.start + relativeStart,
    end: scope.start + relativeStart + tokenContent.length,
    content: tokenContent,
  }
}

function resolveInlineTokenSourceRange(content, lineStartIndexes, token, mappedScopeStack) {
  if (!token?.content) {
    return null
  }

  const mappedRange = resolveMappedTokenRange(content, lineStartIndexes, token)
  if (mappedRange) {
    const relativeStart = mappedRange.content.indexOf(token.content)
    if (relativeStart !== -1) {
      return {
        start: mappedRange.start + relativeStart,
        end: mappedRange.start + relativeStart + token.content.length,
        content: token.content,
      }
    }
  }

  for (let i = mappedScopeStack.length - 1; i >= 0; i--) {
    const sourceRange = resolveInlineTokenSourceRangeFromMappedScope(mappedScopeStack[i], token.content)
    if (sourceRange) {
      return sourceRange
    }
  }

  return null
}

function collectHtmlImageMatchesFromInlineToken(content, lineStartIndexes, token, mappedScopeStack) {
  const inlineSourceRange = resolveInlineTokenSourceRange(content, lineStartIndexes, token, mappedScopeStack)
  if (!inlineSourceRange) {
    return []
  }

  const matchList = []
  const rawTextStack = []
  for (const childToken of token.children) {
    if (childToken?.type !== 'html_inline') {
      continue
    }

    const boundaryToken = resolveRawTextBoundaryToken(childToken.content)
    const insideRawText = rawTextStack.length > 0

    if (!insideRawText) {
      const childSourceRange = childToken.meta?.[SOURCE_RANGE_META_KEY]
      if (isValidSourceRange(childSourceRange)) {
        matchList.push(...collectHtmlImageMatchesFromTokenContent(
          content,
          lineStartIndexes,
          childToken.content,
          inlineSourceRange.start + childSourceRange.from,
        ))
      }
    }

    if (insideRawText) {
      if (boundaryToken?.type === 'close' && boundaryToken.tagName === rawTextStack[rawTextStack.length - 1]) {
        rawTextStack.pop()
      }
      continue
    }

    if (boundaryToken?.type === 'open') {
      rawTextStack.push(boundaryToken.tagName)
    }
  }

  return matchList
}

function collectVideoMatches(content, lineStartIndexes) {
  const matchList = []
  const prefix = '!video('
  let searchIndex = 0

  while (searchIndex < content.length) {
    const startIndex = content.indexOf(prefix, searchIndex)
    if (startIndex === -1) {
      break
    }

    const endIndex = findClosingParenthesis(content, startIndex + prefix.length)
    if (endIndex === -1) {
      searchIndex = startIndex + prefix.length
      continue
    }

    const rawPath = content.slice(startIndex + prefix.length, endIndex).trim()
    if (rawPath) {
      matchList.push(createAssetMatch(content, lineStartIndexes, 'video', startIndex, endIndex + 1, rawPath))
    }

    searchIndex = endIndex + 1
  }

  return matchList
}

function collectAudioMatches(content, lineStartIndexes) {
  const matchList = []
  const prefix = '!audio('
  let searchIndex = 0

  while (searchIndex < content.length) {
    const startIndex = content.indexOf(prefix, searchIndex)
    if (startIndex === -1) {
      break
    }

    const endIndex = findClosingParenthesis(content, startIndex + prefix.length)
    if (endIndex === -1) {
      searchIndex = startIndex + prefix.length
      continue
    }

    const rawPath = content.slice(startIndex + prefix.length, endIndex).trim()
    if (rawPath) {
      matchList.push(createAssetMatch(content, lineStartIndexes, 'audio', startIndex, endIndex + 1, rawPath))
    }

    searchIndex = endIndex + 1
  }

  return matchList
}

function collectLinkMatches(content, lineStartIndexes) {
  return collectMarkdownItMatches(content, lineStartIndexes, 'link')
}

function collectAssetMatches(content, kind, lineStartIndexes) {
  if (kind === 'image') {
    return collectImageMatches(content, lineStartIndexes)
  }
  if (kind === 'video') {
    return collectVideoMatches(content, lineStartIndexes)
  }
  if (kind === 'audio') {
    return collectAudioMatches(content, lineStartIndexes)
  }
  if (kind === 'link') {
    return collectLinkMatches(content, lineStartIndexes)
  }
  return []
}

function collectAllAssetMatches(content, lineStartIndexes) {
  return [
    ...collectImageMatches(content, lineStartIndexes),
    ...collectVideoMatches(content, lineStartIndexes),
    ...collectAudioMatches(content, lineStartIndexes),
    ...collectLinkMatches(content, lineStartIndexes),
  ]
}

function isMatchInLineRange(match, lineStart, lineEnd) {
  const normalizedLineStart = Number.parseInt(lineStart, 10)
  const normalizedLineEnd = Number.parseInt(lineEnd, 10)
  if (Number.isNaN(normalizedLineStart) || Number.isNaN(normalizedLineEnd)) {
    return true
  }
  const rangeStart = Math.min(normalizedLineStart, normalizedLineEnd)
  const rangeEnd = Math.max(normalizedLineStart, normalizedLineEnd)
  return match.lineStart >= rangeStart && match.lineEnd <= rangeEnd
}

function getStandaloneLineRemovalRange(content, match) {
  const currentLineStart = content.lastIndexOf('\n', match.from - 1) + 1
  const currentLineBreakIndex = content.indexOf('\n', match.to)
  const currentLineEnd = currentLineBreakIndex === -1 ? content.length : currentLineBreakIndex
  const linePrefix = content.slice(currentLineStart, match.from)
  const lineSuffix = content.slice(match.to, currentLineEnd)

  if (linePrefix.trim() || lineSuffix.trim()) {
    return match
  }

  let from = currentLineStart
  const to = currentLineBreakIndex === -1 ? content.length : currentLineBreakIndex + 1

  if (currentLineBreakIndex === -1 && from > 0 && content[from - 1] === '\n') {
    from -= 1
  }

  return { ...match, from, to }
}

function normalizeComparableAssetKey(value) {
  const normalizedValue = normalizeAssetPath(value)
  if (!normalizedValue) {
    return ''
  }

  if (normalizedValue.startsWith('#') || normalizedValue.startsWith('//')) {
    return normalizedValue
  }

  const hasExplicitScheme = /^[a-z][a-z\d+.-]*:/i.test(normalizedValue)
  const isWindowsAbsolutePath = /^[a-z]:\//i.test(normalizedValue)
  if (hasExplicitScheme && !isWindowsAbsolutePath) {
    return normalizedValue
  }

  const comparableValue = (normalizedValue.includes('?') || normalizedValue.includes('#'))
    ? normalizedValue
    : normalizePathSegments(normalizedValue, isWindowsAbsolutePath)

  return isWindowsAbsolutePath ? comparableValue.toLowerCase() : comparableValue
}

function normalizePathSegments(value, isAbsolutePath) {
  const pathPrefix = isAbsolutePath
    ? value.slice(0, 3)
    : value.startsWith('/')
      ? '/'
      : ''
  const rawSegmentValue = pathPrefix ? value.slice(pathPrefix.length) : value
  const normalizedSegmentList = []

  for (const segment of rawSegmentValue.split('/')) {
    if (!segment || segment === '.') {
      continue
    }
    if (segment === '..') {
      const lastSegment = normalizedSegmentList[normalizedSegmentList.length - 1]
      if (lastSegment && lastSegment !== '..') {
        normalizedSegmentList.pop()
      } else if (!pathPrefix) {
        normalizedSegmentList.push(segment)
      }
      continue
    }
    normalizedSegmentList.push(segment)
  }

  if (normalizedSegmentList.length === 0) {
    return pathPrefix || '.'
  }

  return `${pathPrefix}${normalizedSegmentList.join('/')}`
}

function resolveComparableAssetKey(rawPath, resolveComparablePath) {
  if (!rawPath) {
    return ''
  }
  const resolvedPath = typeof resolveComparablePath === 'function'
    ? resolveComparablePath(rawPath)
    : rawPath
  return normalizeComparableAssetKey(resolvedPath)
}

function collectMatchedAssetListByComparablePath(content, asset, options = {}) {
  if (!content || !asset?.rawSrc) {
    return []
  }

  const targetAssetKey = resolveComparableAssetKey(asset.rawSrc, options.resolveComparablePath)
  if (!targetAssetKey) {
    return []
  }

  const lineStartIndexes = buildLineStartIndexes(content)
  return collectAllAssetMatches(content, lineStartIndexes)
    .filter((match) => {
      const matchAssetKey = resolveComparableAssetKey(match.rawPath, options.resolveComparablePath)
      return matchAssetKey && matchAssetKey === targetAssetKey
    })
    .sort((a, b) => a.from - b.from)
}

function clampCursorPosition(content, position) {
  if (!Number.isFinite(position)) {
    return 0
  }
  return Math.max(0, Math.min(content.length, position))
}

function getCursorPositionAfterRemoval(nextContent, removalRange) {
  if (!removalRange) {
    return 0
  }
  return clampCursorPosition(nextContent, removalRange.from)
}

function isSameRange(rangeA, rangeB) {
  if (!rangeA || !rangeB) {
    return false
  }
  return rangeA.from === rangeB.from && rangeA.to === rangeB.to
}

function getCursorPositionAfterBatchRemoval(nextContent, removalRangeList, targetRemovalRange) {
  if (!targetRemovalRange) {
    return 0
  }

  const removedLengthBeforeTarget = removalRangeList.reduce((total, currentRange) => {
    if (currentRange.from >= targetRemovalRange.from) {
      return total
    }
    return total + (currentRange.to - currentRange.from)
  }, 0)

  return clampCursorPosition(nextContent, targetRemovalRange.from - removedLengthBeforeTarget)
}

function resolveSelectedRemovalRange(content, asset, matchedAssetList) {
  const selectedMatchedRange = findAssetMarkdownRange(content, asset)
  if (selectedMatchedRange) {
    return getStandaloneLineRemovalRange(content, selectedMatchedRange)
  }

  const occurrence = Number.parseInt(asset?.occurrence, 10)
  if (Number.isNaN(occurrence) || occurrence <= 0) {
    return null
  }

  const occurrenceMatch = matchedAssetList[occurrence - 1]
  return occurrenceMatch ? getStandaloneLineRemovalRange(content, occurrenceMatch) : null
}

export function shouldCleanupMarkdownAfterDeleteResult(deleteResult) {
  if (deleteResult?.ok === true) {
    return true
  }

  // renderer 侧只能根据主进程返回的结构化 reason 决定是否继续清理 Markdown。
  // 这里单独收口的原因有两个：
  // 1. `delete-failed` 必须明确阻断清理，避免“文件没删掉但正文先删了”的状态分叉
  // 2. 旧编辑区和后续预览区如果都要复用这条裁决，就不应该再把原因判断散落在视图里
  return shouldContinueMarkdownCleanup(deleteResult?.reason)
}

function resolveAssetMatchKind(asset) {
  if (typeof asset?.assetType === 'string' && ['image', 'video', 'audio', 'link'].includes(asset.assetType)) {
    return asset.assetType
  }
  if (typeof asset?.kind === 'string' && ['image', 'video', 'audio', 'link'].includes(asset.kind)) {
    return asset.kind
  }
  return null
}

export function findAssetMarkdownRange(content, asset) {
  const assetMatchKind = resolveAssetMatchKind(asset)
  if (!content || !assetMatchKind || !asset?.rawSrc) {
    return null
  }

  const lineStartIndexes = buildLineStartIndexes(content)
  const normalizedAssetPath = normalizeAssetPath(asset.rawSrc)
  const candidateList = collectAssetMatches(content, assetMatchKind, lineStartIndexes)
    .filter(match => match.normalizedPath === normalizedAssetPath)

  if (candidateList.length === 0) {
    return null
  }

  const occurrence = Number.parseInt(asset.occurrence, 10)
  if (!Number.isNaN(occurrence) && occurrence > 0) {
    const occurrenceMatch = candidateList[occurrence - 1]
    if (occurrenceMatch && isMatchInLineRange(occurrenceMatch, asset.lineStart, asset.lineEnd)) {
      return occurrenceMatch
    }
  }

  const lineRangeMatchList = candidateList.filter(match => isMatchInLineRange(match, asset.lineStart, asset.lineEnd))
  if (lineRangeMatchList.length === 1) {
    return lineRangeMatchList[0]
  }

  if (candidateList.length === 1) {
    return candidateList[0]
  }

  return null
}

export function removeAssetFromMarkdown(content, asset) {
  const matchedRange = findAssetMarkdownRange(content, asset)
  if (!matchedRange) {
    return {
      removed: false,
      content,
    }
  }

  const removalRange = getStandaloneLineRemovalRange(content, matchedRange)

  return {
    removed: true,
    content: content.slice(0, removalRange.from) + content.slice(removalRange.to),
    removedRange: removalRange,
    cursorPosition: getCursorPositionAfterRemoval(content.slice(0, removalRange.from) + content.slice(removalRange.to), removalRange),
  }
}

export function countRemainingAssetReferences(content, asset, options = {}) {
  return collectMatchedAssetListByComparablePath(content, asset, options).length
}

export function removeAllAssetReferencesFromMarkdown(content, asset, options = {}) {
  const matchedAssetList = collectMatchedAssetListByComparablePath(content, asset, options)
  if (matchedAssetList.length === 0) {
    return {
      removed: false,
      removedCount: 0,
      content,
    }
  }

  const selectedRemovalRange = resolveSelectedRemovalRange(content, asset, matchedAssetList)
  const removalRangeList = matchedAssetList
    .map(match => getStandaloneLineRemovalRange(content, match))
    .sort((a, b) => b.from - a.from)

  let nextContent = content
  for (const removalRange of removalRangeList) {
    nextContent = nextContent.slice(0, removalRange.from) + nextContent.slice(removalRange.to)
  }

  return {
    removed: true,
    removedCount: matchedAssetList.length,
    content: nextContent,
    cursorPosition: getCursorPositionAfterBatchRemoval(
      nextContent,
      removalRangeList,
      removalRangeList.find(removalRange => isSameRange(removalRange, selectedRemovalRange)) || selectedRemovalRange,
    ),
  }
}

export default {
  countRemainingAssetReferences,
  findAssetMarkdownRange,
  removeAllAssetReferencesFromMarkdown,
  removeAssetFromMarkdown,
  shouldCleanupMarkdownAfterDeleteResult,
}
