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

function findClosingParenthesis(content, startIndex) {
  let escaped = false
  let inAngleBracket = false

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
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
    if (char === ')' && !inAngleBracket) {
      return i
    }
  }

  return -1
}

function extractImagePath(descriptor) {
  const trimmedDescriptor = descriptor.trim()
  if (!trimmedDescriptor) {
    return null
  }

  if (trimmedDescriptor.startsWith('<')) {
    const closeIndex = trimmedDescriptor.indexOf('>')
    if (closeIndex === -1) {
      return null
    }
    return trimmedDescriptor.slice(1, closeIndex).trim()
  }

  const pathMatch = /^[^\s)]+/.exec(trimmedDescriptor)
  return pathMatch ? pathMatch[0].trim() : null
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

    const linkStartIndex = content.indexOf('](', startIndex + 2)
    if (linkStartIndex === -1) {
      break
    }

    const endIndex = findClosingParenthesis(content, linkStartIndex + 2)
    if (endIndex === -1) {
      searchIndex = startIndex + 2
      continue
    }

    const rawPath = extractImagePath(content.slice(linkStartIndex + 2, endIndex))
    if (rawPath) {
      matchList.push(createAssetMatch(content, lineStartIndexes, 'image', startIndex, endIndex + 1, rawPath))
    }

    searchIndex = endIndex + 1
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

    const endIndex = content.indexOf(')', startIndex + prefix.length)
    if (endIndex === -1) {
      break
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

    const endIndex = content.indexOf(')', startIndex + prefix.length)
    if (endIndex === -1) {
      break
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

    const linkStartIndex = content.indexOf('](', startIndex + 1)
    if (linkStartIndex === -1) {
      break
    }

    const endIndex = findClosingParenthesis(content, linkStartIndex + 2)
    if (endIndex === -1) {
      searchIndex = startIndex + 1
      continue
    }

    const rawPath = extractImagePath(content.slice(linkStartIndex + 2, endIndex))
    if (rawPath) {
      matchList.push(createAssetMatch(content, lineStartIndexes, 'link', startIndex, endIndex + 1, rawPath))
    }

    searchIndex = endIndex + 1
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

export default {
  findAssetMarkdownRange,
  removeAssetFromMarkdown,
}
