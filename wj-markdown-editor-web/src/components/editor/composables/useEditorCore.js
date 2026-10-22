import { Compartment } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { ref, shallowRef } from 'vue'
import { isEditorCompositionActive } from '@/util/editor/compositionStateUtil.js'
import editorExtensionUtil from '@/util/editor/editorExtensionUtil.js'

/**
 * 编辑器核心：**每个标签一个 EditorView**。
 *
 * 为什么不是「单 view + `setState()` 换 `EditorState`」：
 *
 * `@codemirror/language` 的 `ParseContext` 是**可变对象**，而且会通过
 * `Language.setState` effect 在多个 `EditorState` 快照之间共享
 * （`ParseWorker` 注入的是 `new LanguageState(field.context)`，同一个 context 引用）。
 * `context.state` 只在 `changes()` 里更新，那条 effect 路径跳过了 `changes()`。
 *
 * 于是只要恢复一个较旧的快照，它内部记录的解析进度就可能"超前"于该快照的文档，
 * 下一次事务在 `ParseContext.changes()` 里 `mapPos(treeLen/viewport/skipped)`
 * 就会抛 `Position X is out of range for changeset of length Y`。
 * 这个越界是在事务**进行中**产生的，任何"事务后检测"都晚一步。
 *
 * 每标签一个 EditorView 让每个标签拥有独立的 `EditorState`、独立的解析上下文、
 * 独立的 DOM，从根上消除共享；undo 历史也天然随标签保留，不需要任何快照换入换出。
 *
 * 代价是多份 CodeMirror DOM。CodeMirror 只渲染视口内的行，
 * 隐藏实例（`display: none`）的解析与测量开销可以忽略。
 */
export function useEditorCore({ editorRef, t }) {
  /**
   * 当前活动标签的 view。
   *
   * 所有对外能力（滚动锚点、搜索、工具栏、预览同步、关联高亮）都通过它
   * 间接拿到「用户正在看的那个编辑器」，所以切换标签只需要换这个引用。
   */
  const editorView = shallowRef(null)

  /** sessionId -> EditorView。生命周期跟随标签，而不是窗口。 */
  const editorViews = new Map()

  /**
   * sessionId -> 挂在该 view scrollDOM 上的监听。
   *
   * scroll 事件发生在 `scrollDOM`（contentDOM 的父级）上，
   * `EditorView.domEventHandlers` 绑不到，只能单独挂。
   */
  const scrollHandlers = new Map()

  const domCompositionActive = ref(false)
  const compositionIdlePending = ref(false)
  const keymapCompartment = new Compartment()
  const themeCompartment = new Compartment()
  const dynamicExtension = editorExtensionUtil.getDynamicExtension()

  /**
   * 当前生效的配置。
   *
   * 新建 view 时用它初始化；配置变更时同步到**所有** view，
   * 因为主题 / 快捷键 / 扩展开关是窗口级设置，不属于单个标签。
   */
  const liveConfig = {
    theme: 'light',
    extensionOptions: null,
    keymapList: [],
  }

  function isCompositionActiveFor(view) {
    return isEditorCompositionActive({
      view: view ?? editorView.value,
      fallbackActive: domCompositionActive.value,
    })
  }

  function isCompositionActive() {
    return isCompositionActiveFor(editorView.value)
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
      // Compartment 必须**始终**注册进 state，关闭状态用空扩展表示。
      //
      // 如果关闭时直接跳过注册，后续 `reconfigureExtensions()` 里的
      // `compartment.reconfigure(...)` 就找不到目标 compartment，effect 会被静默丢弃，
      // 表现为“关掉的行号再也打不开”。
      const enabled = !extensionOptions || extensionOptions[key] !== false
      extensionList.push(dynamicExtension[key].compartment.of(
        enabled ? dynamicExtension[key].extension : [],
      ))
    }
    return extensionList
  }

  /** 对所有已创建的 view 执行同一操作（配置同步用）。 */
  function forEachEditorView(callback) {
    for (const view of editorViews.values()) {
      callback(view)
    }
  }

  /** 释放某个 view 的 scroll 监听。 */
  function releaseScrollHandler(sessionId) {
    const entry = scrollHandlers.get(sessionId)
    if (!entry) {
      return
    }
    entry.element.removeEventListener('scroll', entry.handler)
    scrollHandlers.delete(sessionId)
  }

  /**
   * 为某个标签创建 EditorView。
   *
   * 同一会话重复调用时先销毁旧实例，避免容器里堆两个编辑器。
   *
   * @param {{
   *   sessionId: string | number,
   *   container?: HTMLElement | null,
   *   doc: string,
   *   theme: string,
   *   extensionOptions?: object,
   *   keymapList?: Array,
   *   extraExtensions?: Array,
   *   onDocChange?: Function,
   *   onSelectionChange?: Function,
   *   onCompositionIdle?: Function,
   *   onPaste?: Function,
   *   onDrop?: Function,
   *   onClick?: Function,
   * }} options
   * @returns {EditorView | null} 创建出的 view
   */
  function initEditor({
    sessionId,
    container,
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
    onScroll,
  }) {
    const parent = container ?? editorRef.value
    if (!parent) {
      return null
    }

    // 同会话重复初始化：先销毁旧实例，避免容器里残留两个编辑器
    destroyEditorView(sessionId)

    const dynamicExtensionList = getDynamicExtensionList(extensionOptions)
    liveConfig.theme = theme === 'dark' ? 'dark' : 'light'
    liveConfig.extensionOptions = extensionOptions || null
    liveConfig.keymapList = Array.isArray(keymapList) ? keymapList : []

    const view = new EditorView({
      doc,
      lineWrapping: true,
      extensions: [
        themeCompartment.of(theme === 'dark' ? [oneDark] : []),
        keymapCompartment.of(keymap.of(keymapList)),
        ...extraExtensions,
        ...editorExtensionUtil.getDefault({ t }),
        ...dynamicExtensionList,
        EditorView.updateListener.of((update) => {
          // 组合输入判断必须用事务自己的 view：
          // 后台标签的解析事务同样会走到这里，用 editorView.value 会判断错对象。
          if (update.docChanged && isCompositionActiveFor(update.view) === false) {
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
      parent,
    })

    editorViews.set(sessionId, view)
    editorView.value = view

    // scroll 监听随 view 一起创建：每个标签自带自己的监听，
    // 切换标签天然生效，不依赖外部“重新绑定”的时机。
    if (typeof onScroll === 'function') {
      const handleScroll = () => onScroll(view)
      view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true })
      scrollHandlers.set(sessionId, { element: view.scrollDOM, handler: handleScroll })
    }

    return view
  }

  /**
   * 把某个标签的 view 设为当前活动 view。
   *
   * 隐藏期间（`v-show` 的 `display: none`）CodeMirror 测不到任何尺寸，
   * 行高 / 滚动范围会停在旧值甚至 0。切回可见后必须重新测量，
   * 否则行号、光标定位、滚动恢复都会偏移。
   *
   * @param {string | number} sessionId
   * @returns {EditorView | null} 该标签的 view；尚未创建时返回 null
   */
  function activateEditorView(sessionId) {
    const view = editorViews.get(sessionId) ?? null
    editorView.value = view
    // requestMeasure 会排到下一帧，那时 v-show 已经把容器切回可见。
    view?.requestMeasure?.()
    return view
  }

  /**
   * 销毁某个标签的 view（标签关闭时调用）。
   *
   * @param {string | number} sessionId
   * @returns {boolean} 是否确实销毁了
   */
  function destroyEditorView(sessionId) {
    const view = editorViews.get(sessionId)
    if (!view) {
      return false
    }

    releaseScrollHandler(sessionId)
    if (editorView.value === view) {
      editorView.value = null
    }
    view.destroy()
    editorViews.delete(sessionId)
    return true
  }

  function hasEditorView(sessionId) {
    return editorViews.has(sessionId)
  }

  function destroyEditor() {
    for (const sessionId of [...editorViews.keys()]) {
      releaseScrollHandler(sessionId)
    }
    for (const view of editorViews.values()) {
      view.destroy()
    }
    editorViews.clear()
    editorView.value = null
    domCompositionActive.value = false
    compositionIdlePending.value = false
  }

  function reconfigureTheme(theme) {
    liveConfig.theme = theme === 'dark' ? 'dark' : 'light'
    const effects = themeCompartment.reconfigure(liveConfig.theme === 'dark' ? [oneDark] : [])
    forEachEditorView(view => view.dispatch({ effects }))
  }

  function reconfigureExtensions(extensionOptions) {
    liveConfig.extensionOptions = extensionOptions || null
    forEachEditorView((view) => {
      for (const key in dynamicExtension) {
        const enabled = !liveConfig.extensionOptions || liveConfig.extensionOptions[key] !== false
        view.dispatch({
          effects: dynamicExtension[key].compartment.reconfigure(
            enabled ? dynamicExtension[key].extension : [],
          ),
        })
      }
    })
  }

  function reconfigureKeymap(keymapList) {
    liveConfig.keymapList = Array.isArray(keymapList) ? keymapList : []
    const effects = keymapCompartment.reconfigure(keymap.of(liveConfig.keymapList))
    forEachEditorView(view => view.dispatch({ effects }))
  }

  return {
    editorView,
    isCompositionActive,
    initEditor,
    activateEditorView,
    destroyEditorView,
    hasEditorView,
    destroyEditor,
    reconfigureTheme,
    reconfigureExtensions,
    reconfigureKeymap,
  }
}
