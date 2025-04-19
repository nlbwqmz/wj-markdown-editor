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
      backgroundColor: '#e2e2e2',
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
      // highlightActiveLineGutter(),
      // foldGutter(),
      // keymap.of([
      //   {
      //     key: 'Backspace',
      //     run: (view) => {
      //       startCompletion(view)
      //     },
      //   },
      //   // ...closeBracketsKeymap,
      //   ...defaultKeymap,
      //   ...searchKeymap,
      //   ...historyKeymap,
      //   // ...foldKeymap,
      //   ...completionKeymap,
      //   // ...lintKeymap,
      //   indentWithTab,
      //   {
      //     key: 'Ctrl-s',
      //     preventDefault: true,
      //     stopPropagation: true,
      //     run: () => {
      //       save()
      //     },
      //   },
      //   {
      //     key: 'Ctrl-b',
      //     preventDefault: true,
      //     stopPropagation: true,
      //     run: (view) => {
      //       if (view.state.selection && view.state.selection.ranges
      //         && view.state.selection.ranges.length > 0) {
      //         view.dispatch({
      //           changes: view.state.selection.ranges.map((range) => {
      //             if (range.empty) {
      //               return undefined
      //             }
      //             const text = view.state.doc.slice(range.from, range.to)
      //             return {
      //               from: range.from,
      //               to: range.to,
      //               insert: `**${text}**`,
      //             }
      //           }).filter(item => item !== undefined),
      //         })
      //       }
      //     },
      //   },
      //   {
      //     key: 'Ctrl-e',
      //     preventDefault: true,
      //     stopPropagation: true,
      //     run: (view) => {
      //       if (view.state.selection && view.state.selection.ranges
      //         && view.state.selection.ranges.length > 0) {
      //         view.dispatch({
      //           changes: view.state.selection.ranges.map((range) => {
      //             if (range.empty) {
      //               return undefined
      //             }
      //             const text = view.state.doc.slice(range.from, range.to)
      //             if (!text || text.length === 0) {
      //               return undefined
      //             }
      //             const textStr = text.toString().trim()
      //             if (textStr.startsWith('`') && textStr.endsWith('`')) {
      //               return undefined
      //             }
      //             return {
      //               from: range.from,
      //               to: range.to,
      //               insert: `\`${text}\``,
      //             }
      //           }).filter(item => item !== undefined),
      //         })
      //       }
      //     },
      //   },
      // ]),
    ]
  },
}

export default editorExtensionUtil
