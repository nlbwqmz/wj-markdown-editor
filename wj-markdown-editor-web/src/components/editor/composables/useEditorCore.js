import { Compartment } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { ref, shallowRef } from 'vue'
import { isEditorCompositionActive } from '@/util/editor/compositionStateUtil.js'
import editorExtensionUtil from '@/util/editor/editorExtensionUtil.js'

/**
 * 编辑器核心初始化与重配置
 * 统一管理 EditorView 生命周期，避免业务组件直接处理底层细节
 */
export function useEditorCore({ editorRef }) {
  const editorView = shallowRef(null)
  const domCompositionActive = ref(false)
  const compositionIdlePending = ref(false)
  const keymapCompartment = new Compartment()
  const themeCompartment = new Compartment()
  const dynamicExtension = editorExtensionUtil.getDynamicExtension()

  function isCompositionActive() {
    return isEditorCompositionActive({
      view: editorView.value,
      fallbackActive: domCompositionActive.value,
    })
  }

  function queueCompositionIdleCheck(callback) {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(callback)
      return
    }

    Promise.resolve().then(callback)
  }

  function tryFlushCompositionIdle(onCompositionIdle) {
    if (compositionIdlePending.value !== true || isCompositionActive() === true) {
      return false
    }

    compositionIdlePending.value = false
    onCompositionIdle && onCompositionIdle()
    return true
  }

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
    onCompositionIdle,
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
          if (update.docChanged && isCompositionActive() === false) {
            onDocChange && onDocChange()
          }
          if (update.selectionSet) {
            onSelectionChange && onSelectionChange(update)
          }
          tryFlushCompositionIdle(onCompositionIdle)
        }),
        EditorView.domEventHandlers({
          compositionstart: () => {
            // DOM composition 事件只作为兜底标记，真正的输入状态仍以 CodeMirror view 自身状态为准。
            domCompositionActive.value = true
            compositionIdlePending.value = false
          },
          compositionend: () => {
            domCompositionActive.value = false
            compositionIdlePending.value = true
            queueCompositionIdleCheck(() => {
              tryFlushCompositionIdle(onCompositionIdle)
            })
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
    domCompositionActive.value = false
    compositionIdlePending.value = false
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
    isCompositionActive,
    initEditor,
    destroyEditor,
    reconfigureTheme,
    reconfigureExtensions,
    reconfigureKeymap,
  }
}
