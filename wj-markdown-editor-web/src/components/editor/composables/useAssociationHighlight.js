import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { computed, nextTick, ref } from 'vue'

/**
 * 编辑区与预览区联动高亮
 * 通过 CodeMirror 行装饰实现，不影响用户原始选区
 */
export function useAssociationHighlight({
  editorViewRef,
  previewRef,
  previewController,
  associationHighlight,
  themeRef,
  findPreviewElement,
}) {
  const linkedHighlightState = ref(null)
  let activePreviewHighlightElement = null

  const setLinkedSourceHighlightEffect = StateEffect.define()

  function isSameLineRange(rangeA, rangeB) {
    if (!rangeA && !rangeB) {
      return true
    }
    if (!rangeA || !rangeB) {
      return false
    }
    return rangeA.startLine === rangeB.startLine && rangeA.endLine === rangeB.endLine
  }

  function buildLinkedSourceLineDecorations(doc, lineRange) {
    if (!lineRange) {
      return Decoration.none
    }
    const startLine = Math.max(1, Math.min(doc.lines, lineRange.startLine))
    const endLine = Math.max(1, Math.min(doc.lines, lineRange.endLine))
    const rangeStartLine = Math.min(startLine, endLine)
    const rangeEndLine = Math.max(startLine, endLine)
    const decorationList = []
    for (let lineNumber = rangeStartLine; lineNumber <= rangeEndLine; lineNumber++) {
      const line = doc.line(lineNumber)
      let className = 'cm-linked-source-highlight'
      if (rangeStartLine === rangeEndLine) {
        className += ' cm-linked-source-highlight-single'
      } else if (lineNumber === rangeStartLine) {
        className += ' cm-linked-source-highlight-start'
      } else if (lineNumber === rangeEndLine) {
        className += ' cm-linked-source-highlight-end'
      } else {
        className += ' cm-linked-source-highlight-middle'
      }
      decorationList.push(Decoration.line({ class: className }).range(line.from))
    }
    return Decoration.set(decorationList, true)
  }

  const linkedSourceHighlightField = StateField.define({
    create: () => {
      return {
        lineRange: null,
        decorations: Decoration.none,
      }
    },
    update: (value, transaction) => {
      let lineRange = value.lineRange
      for (const effect of transaction.effects) {
        if (effect.is(setLinkedSourceHighlightEffect)) {
          lineRange = effect.value
        }
      }
      if (lineRange && transaction.docChanged) {
        const maxLine = transaction.state.doc.lines
        lineRange = {
          startLine: Math.max(1, Math.min(maxLine, lineRange.startLine)),
          endLine: Math.max(1, Math.min(maxLine, lineRange.endLine)),
        }
      }
      if (isSameLineRange(lineRange, value.lineRange) && !transaction.docChanged) {
        return value
      }
      return {
        lineRange,
        decorations: buildLinkedSourceLineDecorations(transaction.state.doc, lineRange),
      }
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations),
  })

  function getEditorMaxLineNumber() {
    const view = editorViewRef.value
    return view ? Math.max(1, view.state.doc.lines) : 1
  }

  function normalizeLineNumber(lineNumber) {
    const maxLine = getEditorMaxLineNumber()
    const numericLine = Number.parseInt(lineNumber, 10)
    if (Number.isNaN(numericLine)) {
      return 1
    }
    return Math.max(1, Math.min(maxLine, numericLine))
  }

  function normalizeLineRange(startLine, endLine) {
    const normalizedStartLine = normalizeLineNumber(startLine)
    const normalizedEndLine = normalizeLineNumber(endLine)
    if (normalizedStartLine <= normalizedEndLine) {
      return { startLine: normalizedStartLine, endLine: normalizedEndLine }
    }
    return { startLine: normalizedEndLine, endLine: normalizedStartLine }
  }

  function clearPreviewLinkedHighlight() {
    if (activePreviewHighlightElement) {
      activePreviewHighlightElement.classList.remove('wj-preview-link-highlight')
      activePreviewHighlightElement = null
    }
  }

  function setEditorLinkedHighlight(lineRange) {
    const view = editorViewRef.value
    if (!view) {
      return
    }
    view.dispatch({
      effects: setLinkedSourceHighlightEffect.of(lineRange),
    })
  }

  function clearLinkedHighlightDisplay() {
    clearPreviewLinkedHighlight()
    setEditorLinkedHighlight(null)
  }

  function clearAllLinkedHighlight() {
    clearLinkedHighlightDisplay()
    linkedHighlightState.value = null
  }

  function setPreviewLinkedHighlight(element) {
    if (!element) {
      clearPreviewLinkedHighlight()
      return
    }
    if (activePreviewHighlightElement && activePreviewHighlightElement !== element) {
      activePreviewHighlightElement.classList.remove('wj-preview-link-highlight')
    }
    activePreviewHighlightElement = element
    activePreviewHighlightElement.classList.add('wj-preview-link-highlight')
  }

  function getLineRangeFromPreviewElement(element) {
    if (!element) {
      return null
    }
    const startLine = Number.parseInt(element.dataset.lineStart, 10)
    if (Number.isNaN(startLine)) {
      return null
    }
    const endLine = Number.parseInt(element.dataset.lineEnd, 10)
    return {
      startLine,
      endLine: Number.isNaN(endLine) ? startLine : endLine,
    }
  }

  function isPreviewPanelActive() {
    return previewController.value === true && !!previewRef.value
  }

  function syncPreviewLinkedHighlightByLine(lineNumber) {
    const view = editorViewRef.value
    if (!view || !isPreviewPanelActive()) {
      clearLinkedHighlightDisplay()
      return
    }
    const normalizedLineNumber = normalizeLineNumber(lineNumber)
    const previewElement = findPreviewElement(view.state.doc.lines, normalizedLineNumber, true)
    if (!previewElement.found || !previewElement.element) {
      clearAllLinkedHighlight()
      return
    }
    const elementStart = +previewElement.element.dataset.lineStart
    const elementEnd = +previewElement.element.dataset.lineEnd || elementStart
    if (normalizedLineNumber < elementStart || normalizedLineNumber > elementEnd) {
      clearAllLinkedHighlight()
      return
    }
    setPreviewLinkedHighlight(previewElement.element)
  }

  function highlightBothSidesByLineRange(startLine, endLine, preferLine = startLine) {
    const view = editorViewRef.value
    if (!view || associationHighlight.value !== true) {
      return
    }
    const normalizedLineRange = normalizeLineRange(startLine, endLine)
    const normalizedPreferLine = normalizeLineNumber(preferLine)
    if (!isPreviewPanelActive()) {
      linkedHighlightState.value = {
        ...normalizedLineRange,
        preferLine: normalizedPreferLine,
      }
      clearLinkedHighlightDisplay()
      return
    }
    const previewElement = findPreviewElement(view.state.doc.lines, normalizedPreferLine, true)
    if (!previewElement.found || !previewElement.element) {
      clearAllLinkedHighlight()
      return
    }
    const elementStart = +previewElement.element.dataset.lineStart
    const elementEnd = +previewElement.element.dataset.lineEnd || elementStart
    if (normalizedPreferLine < elementStart || normalizedPreferLine > elementEnd) {
      clearAllLinkedHighlight()
      return
    }
    const nextLinkedHighlightState = {
      ...normalizedLineRange,
      preferLine: normalizedPreferLine,
    }
    linkedHighlightState.value = nextLinkedHighlightState
    setEditorLinkedHighlight(normalizedLineRange)
    setPreviewLinkedHighlight(previewElement.element)
  }

  function highlightByEditorCursor(state) {
    const view = editorViewRef.value
    if (!view || associationHighlight.value !== true) {
      return
    }
    const currentState = state || view.state
    const lineNumber = currentState.doc.lineAt(currentState.selection.main.to).number
    highlightBothSidesByLineRange(lineNumber, lineNumber, lineNumber)
  }

  function onPreviewAreaClick(event) {
    const view = editorViewRef.value
    if (!previewRef.value || !view || associationHighlight.value !== true) {
      return
    }
    if (!(event.target instanceof Element)) {
      return
    }
    const targetLineElement = event.target.closest('[data-line-start]')
    if (!(targetLineElement instanceof Element) || !previewRef.value.contains(targetLineElement)) {
      return
    }
    const lineRange = getLineRangeFromPreviewElement(targetLineElement)
    if (!lineRange) {
      return
    }
    highlightBothSidesByLineRange(lineRange.startLine, lineRange.endLine, lineRange.startLine)
  }

  function restorePreviewLinkedHighlight() {
    if (associationHighlight.value !== true) {
      clearAllLinkedHighlight()
      return
    }
    if (!linkedHighlightState.value) {
      clearPreviewLinkedHighlight()
      return
    }
    nextTick(() => {
      if (!linkedHighlightState.value) {
        return
      }
      syncPreviewLinkedHighlightByLine(linkedHighlightState.value.preferLine)
    })
  }

  const linkedHighlightThemeStyle = computed(() => {
    if (themeRef.value === 'dark') {
      return {
        '--wj-link-highlight-border': '#69b1ff',
        '--wj-link-highlight-bg': 'rgba(105, 177, 255, 0.2)',
        '--wj-link-highlight-width': '2px',
        '--wj-link-highlight-radius': '6px',
      }
    }
    return {
      '--wj-link-highlight-border': '#1677ff',
      '--wj-link-highlight-bg': 'rgba(22, 119, 255, 0.12)',
      '--wj-link-highlight-width': '2px',
      '--wj-link-highlight-radius': '6px',
    }
  })

  return {
    linkedSourceHighlightField,
    linkedHighlightThemeStyle,
    clearAllLinkedHighlight,
    clearLinkedHighlightDisplay,
    highlightByEditorCursor,
    onPreviewAreaClick,
    restorePreviewLinkedHighlight,
  }
}
