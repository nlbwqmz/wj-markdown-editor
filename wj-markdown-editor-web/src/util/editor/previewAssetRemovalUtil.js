import MarkdownIt from 'markdown-it'
import linkRule from 'markdown-it/lib/rules_inline/link.mjs'
import StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'

const markdownItLinkMatcher = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
})

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

function collectImageMatches(content, lineStartIndexes) {
  const matchList = []
  let searchIndex = 0

  while (searchIndex < content.length) {
    const startIndex = content.indexOf('![', searchIndex)
    if (startIndex === -1) {
      break
    }

    const state = new StateInline(content, markdownItLinkMatcher, {}, [])
    state.pos = startIndex
    state.posMax = content.length

    if (!state.md.inline.ruler.getRules('').some(rule => rule(state, false) && state.tokens.some(token => token.type === 'image'))) {
      searchIndex = startIndex + 2
      continue
    }

    const imageToken = state.tokens.find(token => token.type === 'image')
    const rawPath = normalizeAssetPath(imageToken?.attrGet('src'))
    if (rawPath) {
      matchList.push(createAssetMatch(content, lineStartIndexes, 'image', startIndex, state.pos, rawPath))
    }

    searchIndex = state.pos
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
  const matchList = []
  let searchIndex = 0

  while (searchIndex < content.length) {
    const startIndex = content.indexOf('[', searchIndex)
    if (startIndex === -1) {
      break
    }

    if (startIndex > 0 && content[startIndex - 1] === '!') {
      searchIndex = startIndex + 1
      continue
    }

    const state = new StateInline(content, markdownItLinkMatcher, {}, [])
    state.pos = startIndex
    state.posMax = content.length

    if (!linkRule(state, false)) {
      searchIndex = startIndex + 1
      continue
    }

    const linkOpenToken = state.tokens.find(token => token.type === 'link_open')
    const rawPath = normalizeAssetPath(linkOpenToken?.attrGet('href'))
    if (rawPath) {
      matchList.push(createAssetMatch(content, lineStartIndexes, 'link', startIndex, state.pos, rawPath))
    }

    searchIndex = state.pos
  }

  return matchList
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
  return /^[a-z]:\//i.test(normalizedValue) ? normalizedValue.toLowerCase() : normalizedValue
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
}

export function findAssetMarkdownRange(content, asset) {
  if (!content || !asset?.kind || !asset?.rawSrc) {
    return null
  }

  const lineStartIndexes = buildLineStartIndexes(content)
  const normalizedAssetPath = normalizeAssetPath(asset.rawSrc)
  const candidateList = collectAssetMatches(content, asset.kind, lineStartIndexes)
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
  }
}

export default {
  countRemainingAssetReferences,
  findAssetMarkdownRange,
  removeAllAssetReferencesFromMarkdown,
  removeAssetFromMarkdown,
}
