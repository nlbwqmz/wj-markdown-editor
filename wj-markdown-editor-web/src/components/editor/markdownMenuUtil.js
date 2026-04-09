function normalizeAnchorChildren(children) {
  return Array.isArray(children) ? children : []
}

const MARKDOWN_MENU_TYPOGRAPHY_MAP = Object.freeze({
  1: Object.freeze({ fontSize: '15px', fontWeight: 600 }),
  2: Object.freeze({ fontSize: '14px', fontWeight: 600 }),
  3: Object.freeze({ fontSize: '13px', fontWeight: 500 }),
  4: Object.freeze({ fontSize: '12px', fontWeight: 500 }),
  5: Object.freeze({ fontSize: '12px', fontWeight: 400 }),
  6: Object.freeze({ fontSize: '11px', fontWeight: 400 }),
})
const MARKDOWN_MENU_ACTIVE_AHEAD_TOLERANCE = 4

function normalizeHeadingLevel(level) {
  const numericLevel = Number(level)
  if (!Number.isInteger(numericLevel)) {
    return 6
  }

  if (numericLevel < 1) {
    return 1
  }

  if (numericLevel > 6) {
    return 6
  }

  return numericLevel
}

export function flattenMarkdownMenuAnchors(anchorList, depth = 0, collection = []) {
  const normalizedAnchorList = Array.isArray(anchorList) ? anchorList : []

  normalizedAnchorList.forEach((item) => {
    if (!item?.href) {
      return
    }

    collection.push({
      key: item.key,
      href: item.href,
      title: item.title,
      level: item.level,
      depth,
    })

    flattenMarkdownMenuAnchors(normalizeAnchorChildren(item.children), depth + 1, collection)
  })

  return collection
}

export function resolveMarkdownMenuActiveHref({
  headingRecords,
  scrollTop,
  clientHeight,
  scrollHeight,
}) {
  const normalizedHeadingRecords = Array.isArray(headingRecords) ? headingRecords : []
  if (normalizedHeadingRecords.length === 0) {
    return ''
  }

  if (scrollTop + clientHeight >= scrollHeight - 1) {
    return normalizedHeadingRecords.at(-1)?.href || ''
  }

  const activationScrollTop = scrollTop + MARKDOWN_MENU_ACTIVE_AHEAD_TOLERANCE
  let activeHref = normalizedHeadingRecords[0]?.href || ''
  normalizedHeadingRecords.forEach((record) => {
    if (record.top <= activationScrollTop) {
      activeHref = record.href
    }
  })

  return activeHref
}

export function resolveMarkdownMenuTargetScrollTop({
  containerTop,
  containerScrollTop,
  containerClientTop,
  targetTop,
}) {
  return targetTop - containerTop - containerClientTop + containerScrollTop
}

export function resolveMarkdownMenuTypography(level) {
  return MARKDOWN_MENU_TYPOGRAPHY_MAP[normalizeHeadingLevel(level)]
}
