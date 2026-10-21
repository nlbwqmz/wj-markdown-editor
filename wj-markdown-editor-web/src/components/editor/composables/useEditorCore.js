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
export function useEditorCore({ editorRef, t }) {
  const editorView = shallowRef(null)
  const domCompositionActive = ref(false)
  const compositionIdlePending = ref(false)
  const keymapCompartment = new Compartment()
  const themeCompartment = new Compartment()
  const dynamicExtension = editorExtensionUtil.getDynamicExtension()

  /**
   * 当前生效的动态配置快照。
   *
   * Compartment 的重配置效果只会作用到「被 dispatch 的那个 EditorState」上，
   * 而多标签下每个会话都持有一份自己保存的 EditorState。
   * 如果主题 / 快捷键 / 扩展开关在 A 标签里改过，B 标签保存的状态里仍然是旧配置，
   * 换回去时就会渲染成旧主题。
   *
   * 所以这里把“最后一次生效的配置”记下来，换回任何存档状态后再重放一次。
   */
  const liveConfig = {
    theme: 'light',
    extensionOptions: null,
    keymapList: [],
  }

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
    liveConfig.theme = theme === 'dark' ? 'dark' : 'light'
    liveConfig.extensionOptions = extensionOptions || null
    liveConfig.keymapList = Array.isArray(keymapList) ? keymapList : []
    editorView.value = new EditorView({
      doc,
      lineWrapping: true,
      extensions: [
        themeCompartment.of(theme === 'dark' ? [oneDark] : []),
        keymapCompartment.of(keymap.of(keymapList)),
        ...extraExtensions,
        ...editorExtensionUtil.getDefault({ t }),
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
            // 透传上层处理结果：返回 true 时 CodeMirror 会阻止内建处理，
            // 供“拖入 Markdown 文档按打开处理”这类场景接管拖拽。
            return onDrop ? onDrop(event, view) : false
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
    liveConfig.theme = theme === 'dark' ? 'dark' : 'light'
    if (!editorView.value) {
      return
    }
    editorView.value.dispatch({
      effects: themeCompartment.reconfigure(liveConfig.theme === 'dark' ? [oneDark] : []),
    })
  }

  function reconfigureExtensions(extensionOptions) {
    liveConfig.extensionOptions = extensionOptions || null
    if (!editorView.value) {
      return
    }
    for (const key in dynamicExtension) {
      if (!liveConfig.extensionOptions || liveConfig.extensionOptions[key] !== false) {
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
    liveConfig.keymapList = Array.isArray(keymapList) ? keymapList : []
    if (!editorView.value) {
      return
    }
    editorView.value.dispatch({
      effects: keymapCompartment.reconfigure(keymap.of(liveConfig.keymapList)),
    })
  }

  /**
   * 把当前生效的配置重新应用到当前 EditorState。
   *
   * 多标签换回某个会话的存档状态后必须调一次：
   * 存档状态里冻结的是它被保存那一刻的 compartment 内容，
   * 不重放就会把主题、快捷键、扩展开关全部退回到旧值。
   *
   * @returns {boolean} 是否成功下发重配置。
   */
  function reapplyLiveConfiguration() {
    const view = editorView.value
    if (!view) {
      return false
    }

    const effects = [
      themeCompartment.reconfigure(liveConfig.theme === 'dark' ? [oneDark] : []),
      keymapCompartment.reconfigure(keymap.of(liveConfig.keymapList)),
    ]

    for (const key in dynamicExtension) {
      const enabled = !liveConfig.extensionOptions || liveConfig.extensionOptions[key] !== false
      effects.push(dynamicExtension[key].compartment.reconfigure(
        enabled ? dynamicExtension[key].extension : [],
      ))
    }

    view.dispatch({ effects })
    return true
  }

  return {
    editorView,
    isCompositionActive,
    initEditor,
    destroyEditor,
    reconfigureTheme,
    reconfigureExtensions,
    reconfigureKeymap,
    reapplyLiveConfiguration,
  }
}
