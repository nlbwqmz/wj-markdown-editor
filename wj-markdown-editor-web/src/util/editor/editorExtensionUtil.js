import completionHandler from '@/util/editor/completion/completionHandler.js'
import {
  autocompletion,
  closeBrackets,
} from '@codemirror/autocomplete'
import { history } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { EditorView } from 'codemirror'

/**
 * 固定的插件
 */
const fixedExtension = [
  history(),
  drawSelection(),
  dropCursor(),
  indentOnInput(),
  markdown({ codeLanguages: languages }),
  EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '14px',
    },
    '.cm-line': {
      fontFamily: 'source-code-pro,Menlo,Monaco,Consolas,Courier New,monospace', // 字体
    },
    '.cm-content': {
      lineHeight: '1.5',
    },
    '.cm-gutterElement': {
      userSelect: 'none',
    },
    '.cm-scroller': {
      overflowY: 'scroll',
    },
    '*::-webkit-scrollbar': {
      display: 'revert',
      width: '6px',
      height: '6px',
    },
    /* 滚动条里面轨道 */
    '*::-webkit-scrollbar-track': {
      backgroundColor: 'var(--wj-markdown-scroll-bg)',
    },
    /* 滚动条的样式 */
    '*::-webkit-scrollbar-thumb': {
      borderRadius: '4px',
      backgroundColor: '#0000004d',
    },
    '*::-webkit-scrollbar-thumb:hover': {
      backgroundColor: '#00000059',
    },
    '*::-webkit-scrollbar-thumb:active': {
      backgroundColor: '#00000061',
    },
  }),
  autocompletion({
    override: [
      completionHandler,
    ],
  }),
]

const dynamicExtension = [
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  EditorState.allowMultipleSelections.of(true),
  highlightSpecialChars(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  lineNumbers(),
  EditorView.lineWrapping,
]

const editorExtensionUtil = {
  getDefault: () => {
    return [
      ...fixedExtension,
      ...dynamicExtension,
    ]
  },
}

export default editorExtensionUtil
