function normalizeToken(token) {
  return Number.isInteger(token) && token > 0 ? token : 0
}

function normalizeCursorPosition(cursorPosition) {
  return Number.isInteger(cursorPosition) ? cursorPosition : null
}

export function resolvePendingContentUpdateMeta({ handledToken = 0, contentUpdateMeta } = {}) {
  const normalizedHandledToken = normalizeToken(handledToken)
  const currentToken = normalizeToken(contentUpdateMeta?.token)

  if (currentToken === 0 || currentToken === normalizedHandledToken) {
    return {
      shouldApplySelection: false,
      cursorPosition: null,
      focus: false,
      scrollIntoView: false,
      nextHandledToken: normalizedHandledToken,
    }
  }

  const cursorPosition = normalizeCursorPosition(contentUpdateMeta?.cursorPosition)
  const shouldApplySelection = cursorPosition !== null

  return {
    shouldApplySelection,
    cursorPosition,
    focus: shouldApplySelection && contentUpdateMeta?.focus === true,
    scrollIntoView: shouldApplySelection && contentUpdateMeta?.scrollIntoView === true,
    nextHandledToken: currentToken,
  }
}

export default {
  resolvePendingContentUpdateMeta,
}
