function createEmptySearchResult() {
  return {
    total: 0,
    current: 0,
  }
}

function resolveSearchResult({
  total,
  previousCurrent = 0,
  preserveCurrent = false,
}) {
  if (total <= 0) {
    return createEmptySearchResult()
  }

  if (preserveCurrent === true && previousCurrent > 0) {
    return {
      total,
      current: Math.min(previousCurrent, total),
    }
  }

  return {
    total,
    current: 1,
  }
}

function getNextSearchCurrent({
  current,
  total,
  direction,
}) {
  if (total <= 0) {
    return 0
  }

  if (direction === 'up') {
    return current <= 1 ? total : current - 1
  }

  return current >= total ? 1 : current + 1
}

export {
  createEmptySearchResult,
  getNextSearchCurrent,
  resolveSearchResult,
}
