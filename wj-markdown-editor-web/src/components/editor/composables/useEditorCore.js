import editorExtensionUtil from '@/util/editor/editorExtensionUtil.js'
import { Compartment } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { ref } from 'vue'

/**
 * 编辑器核心初始化与重配置
 * 统一管理 EditorView 生命周期，避免业务组件直接处理底层细节
 */
export function useEditorCore({ editorRef }) {
  const editorView = ref(null)
  const isComposing = ref(false)
  const keymapCompartment = new Compartment()
  const themeCompartment = new Compartment()
  const dynamicExtension = editorExtensionUtil.getDynamicExtension()

  function getDynamicExtensionList(extensionOptions) {
    const extensionList = []
    for (const key in dynamicExtension) {
      if (!extensionOptions || extensionOptions[key] !== false) {
        extensionList.push(dynamicExtension[key].compartment.of(dynamicExtension[key].extension))
      }
    }
    return extensionList
  }

  function initEditor({
    doc,
    theme,
    extensionOptions,
    keymapList,
    extraExtensions = [],
    onDocChange,
    onSelectionChange,
    onCompositionEnd,
    onPaste,
    onDrop,
    onClick,
  }) {
    if (!editorRef.value) {
      return
    }

    const dynamicExtensionList = getDynamicExtensionList(extensionOptions)
    editorView.value = new EditorView({
      doc,
      lineWrapping: true,
      extensions: [
        themeCompartment.of(theme === 'dark' ? [oneDark] : []),
        keymapCompartment.of(keymap.of(keymapList)),
        ...extraExtensions,
        ...editorExtensionUtil.getDefault(),
        ...dynamicExtensionList,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && isComposing.value === false) {
            onDocChange && onDocChange()
          }
          if (update.selectionSet) {
            onSelectionChange && onSelectionChange(update.state)
          }
        }),
        EditorView.domEventHandlers({
          compositionstart: () => {
            // @codemirror/view 固定 6.27.0，该版本事件行为稳定
            isComposing.value = true
          },
          compositionend: () => {
            isComposing.value = false
            onCompositionEnd && onCompositionEnd()
          },
          paste: (event, view) => {
            onPaste && onPaste(event, view)
          },
          click: (_event, view) => {
            onClick && onClick(view)
          },
          drop: (event, view) => {
            onDrop && onDrop(event, view)
          },
        }),
      ],
      parent: editorRef.value,
    })
  }

  function destroyEditor() {
    if (editorView.value) {
      editorView.value.destroy()
      editorView.value = null
    }
  }

  function reconfigureTheme(theme) {
    if (!editorView.value) {
      return
    }
    editorView.value.dispatch({
      effects: themeCompartment.reconfigure(theme === 'dark' ? [oneDark] : []),
    })
  }

  function reconfigureExtensions(extensionOptions) {
    if (!editorView.value) {
      return
    }
    for (const key in dynamicExtension) {
      if (!extensionOptions || extensionOptions[key] !== false) {
        editorView.value.dispatch({
          effects: dynamicExtension[key].compartment.reconfigure(dynamicExtension[key].extension),
        })
      } else {
        editorView.value.dispatch({
          effects: dynamicExtension[key].compartment.reconfigure([]),
        })
      }
    }
  }

  function reconfigureKeymap(keymapList) {
    if (!editorView.value) {
      return
    }
    editorView.value.dispatch({
      effects: keymapCompartment.reconfigure(keymap.of(keymapList)),
    })
  }

  return {
    editorView,
    initEditor,
    destroyEditor,
    reconfigureTheme,
    reconfigureExtensions,
    reconfigureKeymap,
  }
}
