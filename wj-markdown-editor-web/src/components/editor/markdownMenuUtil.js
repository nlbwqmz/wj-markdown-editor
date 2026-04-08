function normalizeAnchorChildren(children) {
  return Array.isArray(children) ? children : []
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

  let activeHref = normalizedHeadingRecords[0]?.href || ''
  normalizedHeadingRecords.forEach((record) => {
    if (record.top <= scrollTop) {
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
