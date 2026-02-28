import TableShape from '@/components/TableShape.vue'
import channelUtil from '@/util/channel/channelUtil.js'
import commonUtil from '@/util/commonUtil.js'
import editorUtil from '@/util/editor/editorUtil.js'
import { message } from 'ant-design-vue'
import { createVNode, h } from 'vue'
import { ColorPicker } from 'vue3-colorpicker'

/**
 * 工具栏配置生成
 * 将按钮定义与主组件编排逻辑解耦
 */
export function useToolbarBuilder({
  t,
  shortcutKeyList,
  editorViewRef,
  emits,
  jumpToTargetLine,
  previewVisible,
  menuVisible,
  previewRef,
  openNetworkImageModal,
  insertFileToEditor,
}) {
  function getEditorView() {
    return editorViewRef.value
  }

  function getKeymapByShortcutKeyId(id) {
    const shortcutKey = shortcutKeyList.value.find(item => item.id === id && item.enabled === true)
    if (shortcutKey) {
      return shortcutKey.keymap
    }
    return ''
  }

  function applyColorToRange(originalStr, color, startIndex, endIndex) {
    if (startIndex < 0 || endIndex > originalStr.length || startIndex > endIndex) {
      throw new Error('Invalid range coordinates')
    }
    const targetSubstring = originalStr.substring(startIndex, endIndex)
    const colorSyntaxRegex = /^\{([^}]+)\}\(([^)]+)\)$/
    const isWrapped = colorSyntaxRegex.test(targetSubstring)
    if (isWrapped) {
      const match = targetSubstring.match(colorSyntaxRegex)
      const newWrapped = `{${color}}(${match[2]})`
      return (
        originalStr.substring(0, startIndex)
        + newWrapped
        + originalStr.substring(endIndex)
      )
    } else {
      const newWrapped = `{${color}}(${targetSubstring})`
      return (
        originalStr.substring(0, startIndex)
        + newWrapped
        + originalStr.substring(endIndex)
      )
    }
  }

  function onTextColorChange(color) {
    const view = getEditorView()
    if (!view) {
      return
    }
    const main = view.state.selection.main
    if (main.from === main.to) {
      return
    }
    const fromLine = view.state.doc.lineAt(main.from)
    const toLine = view.state.doc.lineAt(main.to)
    if (fromLine.number !== toLine.number) {
      return
    }
    const lineText = fromLine.text
    const convertedText = applyColorToRange(lineText, color, main.from - fromLine.from, main.to - fromLine.from)
    view.dispatch({
      changes: {
        from: fromLine.from,
        to: fromLine.to,
        insert: convertedText,
      },
      selection: { anchor: main.from, head: fromLine.from + convertedText.length - (fromLine.to - main.to) },
    })
  }

  function runWithEditor(callback) {
    const view = getEditorView()
    if (!view) {
      return
    }
    callback(view)
  }

  function buildToolbarList() {
    const defaultToolbar = {
      bold: {
        label: t('shortcutKey.editor-bold'),
        icon: 'i-tabler:bold',
        shortcutKey: getKeymapByShortcutKeyId('editor-bold'),
        action: () => runWithEditor(view => editorUtil.bold(view)),
      },
      underline: {
        label: t('shortcutKey.editor-underline'),
        icon: 'i-tabler:underline',
        shortcutKey: getKeymapByShortcutKeyId('editor-underline'),
        action: () => runWithEditor(view => editorUtil.underline(view)),
      },
      italic: {
        label: t('shortcutKey.editor-italic'),
        icon: 'i-tabler:italic',
        shortcutKey: getKeymapByShortcutKeyId('editor-italic'),
        action: () => runWithEditor(view => editorUtil.italic(view)),
      },
      strikeThrough: {
        label: t('shortcutKey.editor-del'),
        icon: 'i-tabler:a-b-off',
        shortcutKey: getKeymapByShortcutKeyId('editor-del'),
        action: () => runWithEditor(view => editorUtil.strikeThrough(view)),
      },
      heading: {
        label: t('editor.heading'),
        icon: 'i-tabler:heading',
        menuList: [
          {
            label: getKeymapByShortcutKeyId('editor-heading-1')
              ? commonUtil.createLabel(t('shortcutKey.editor-heading-1'), getKeymapByShortcutKeyId('editor-heading-1'))
              : t('shortcutKey.editor-heading-1'),
            action: () => runWithEditor(view => editorUtil.heading(view, 1)),
          },
          {
            label: getKeymapByShortcutKeyId('editor-heading-2')
              ? commonUtil.createLabel(t('shortcutKey.editor-heading-2'), getKeymapByShortcutKeyId('editor-heading-2'))
              : t('shortcutKey.editor-heading-2'),
            action: () => runWithEditor(view => editorUtil.heading(view, 2)),
          },
          {
            label: getKeymapByShortcutKeyId('editor-heading-3')
              ? commonUtil.createLabel(t('shortcutKey.editor-heading-3'), getKeymapByShortcutKeyId('editor-heading-3'))
              : t('shortcutKey.editor-heading-3'),
            action: () => runWithEditor(view => editorUtil.heading(view, 3)),
          },
          {
            label: getKeymapByShortcutKeyId('editor-heading-4')
              ? commonUtil.createLabel(t('shortcutKey.editor-heading-4'), getKeymapByShortcutKeyId('editor-heading-4'))
              : t('shortcutKey.editor-heading-4'),
            action: () => runWithEditor(view => editorUtil.heading(view, 4)),
          },
          {
            label: getKeymapByShortcutKeyId('editor-heading-5')
              ? commonUtil.createLabel(t('shortcutKey.editor-heading-5'), getKeymapByShortcutKeyId('editor-heading-5'))
              : t('shortcutKey.editor-heading-5'),
            action: () => runWithEditor(view => editorUtil.heading(view, 5)),
          },
          {
            label: getKeymapByShortcutKeyId('editor-heading-6')
              ? commonUtil.createLabel(t('shortcutKey.editor-heading-6'), getKeymapByShortcutKeyId('editor-heading-6'))
              : t('shortcutKey.editor-heading-6'),
            action: () => runWithEditor(view => editorUtil.heading(view, 6)),
          },
        ],
      },
      subscript: {
        label: t('shortcutKey.editor-subscript'),
        icon: 'i-tabler:subscript',
        shortcutKey: getKeymapByShortcutKeyId('editor-subscript'),
        action: () => runWithEditor(view => editorUtil.subscript(view)),
      },
      superscript: {
        label: t('shortcutKey.editor-superscript'),
        icon: 'i-tabler:superscript',
        shortcutKey: getKeymapByShortcutKeyId('editor-superscript'),
        action: () => runWithEditor(view => editorUtil.superscript(view)),
      },
      quote: {
        label: t('shortcutKey.editor-quote'),
        icon: 'i-tabler:quote-filled',
        shortcutKey: getKeymapByShortcutKeyId('editor-quote'),
        action: () => runWithEditor(view => editorUtil.quote(view)),
      },
      list: {
        label: t('shortcutKey.editor-list'),
        icon: 'i-tabler:list',
        shortcutKey: getKeymapByShortcutKeyId('editor-list'),
        action: () => runWithEditor(view => editorUtil.list(view)),
      },
      numberList: {
        label: t('shortcutKey.editor-list-numbers'),
        icon: 'i-tabler:list-numbers',
        shortcutKey: getKeymapByShortcutKeyId('editor-list-numbers'),
        action: () => runWithEditor(view => editorUtil.numberList(view)),
      },
      taskList: {
        label: t('shortcutKey.editor-list-check'),
        icon: 'i-tabler:list-check',
        shortcutKey: getKeymapByShortcutKeyId('editor-list-check'),
        action: () => runWithEditor(view => editorUtil.taskList(view)),
      },
      code: {
        label: t('shortcutKey.editor-code-inline'),
        icon: 'i-tabler:terminal',
        shortcutKey: getKeymapByShortcutKeyId('editor-code-inline'),
        action: () => runWithEditor(view => editorUtil.code(view)),
      },
      blockCode: {
        label: t('shortcutKey.editor-code-block'),
        icon: 'i-tabler:terminal-2',
        shortcutKey: getKeymapByShortcutKeyId('editor-code-block'),
        action: () => runWithEditor(view => editorUtil.blockCode(view)),
      },
      link: {
        label: t('shortcutKey.editor-link'),
        icon: 'i-tabler:link',
        shortcutKey: getKeymapByShortcutKeyId('editor-link'),
        action: () => runWithEditor(view => editorUtil.link(view)),
      },
      mark: {
        label: t('shortcutKey.editor-mark'),
        icon: 'i-tabler:brush',
        shortcutKey: getKeymapByShortcutKeyId('editor-mark'),
        action: () => runWithEditor(view => editorUtil.mark(view)),
      },
      table: {
        label: t('editor.table'),
        icon: 'i-tabler:table',
        popover: createVNode(TableShape, {
          col: 6,
          row: 6,
          onSelect: (row, col) => {
            runWithEditor((view) => {
              const main = view.state.selection.main
              editorUtil.insertTable(view, row, col, main.from, main.to)
            })
          },
        }),
      },
      alert: {
        label: t('editor.alert'),
        icon: 'i-tabler:alert-square',
        menuList: [
          { label: 'note', action: () => runWithEditor(view => editorUtil.alertContainer(view, 'note')) },
          { label: 'tip', action: () => runWithEditor(view => editorUtil.alertContainer(view, 'tip')) },
          { label: 'important', action: () => runWithEditor(view => editorUtil.alertContainer(view, 'important')) },
          { label: 'warning', action: () => runWithEditor(view => editorUtil.alertContainer(view, 'warning')) },
          { label: 'caution', action: () => runWithEditor(view => editorUtil.alertContainer(view, 'caution')) },
        ],
      },
      container: {
        label: t('editor.container'),
        icon: 'i-tabler:container',
        menuList: [
          { label: 'info', action: () => runWithEditor(view => editorUtil.container(view, 'info')) },
          { label: 'tip', action: () => runWithEditor(view => editorUtil.container(view, 'tip')) },
          { label: 'important', action: () => runWithEditor(view => editorUtil.container(view, 'important')) },
          { label: 'warning', action: () => runWithEditor(view => editorUtil.container(view, 'warning')) },
          { label: 'danger', action: () => runWithEditor(view => editorUtil.container(view, 'danger')) },
          { label: 'details', action: () => runWithEditor(view => editorUtil.container(view, 'details')) },
        ],
      },
      image: {
        label: t('editor.image'),
        icon: 'i-tabler:photo',
        menuList: [
          {
            label: getKeymapByShortcutKeyId('editor-image-template')
              ? commonUtil.createLabel(t('shortcutKey.editor-image-template'), getKeymapByShortcutKeyId('editor-image-template'))
              : t('shortcutKey.editor-image-template'),
            action: () => runWithEditor(view => editorUtil.image(view)),
          },
          {
            label: t('editor.localImage'),
            action: () => runWithEditor(view => editorUtil.imageLocal(view)),
          },
          {
            label: t('editor.networkImage'),
            action: () => {
              openNetworkImageModal()
            },
          },
          {
            label: getKeymapByShortcutKeyId('editor-screenshot')
              ? commonUtil.createLabel(t('shortcutKey.editor-screenshot'), getKeymapByShortcutKeyId('editor-screenshot'))
              : t('shortcutKey.editor-screenshot'),
            action: () => runWithEditor(view => editorUtil.screenshot(view, false)),
          },
          {
            label: getKeymapByShortcutKeyId('editor-screenshot-hide')
              ? commonUtil.createLabel(t('shortcutKey.editor-screenshot-hide'), getKeymapByShortcutKeyId('editor-screenshot-hide'))
              : t('shortcutKey.editor-screenshot-hide'),
            action: () => runWithEditor(view => editorUtil.screenshot(view, true)),
          },
        ],
      },
      file: {
        label: t('editor.file'),
        icon: 'i-tabler:file',
        action: () => {
          const input = document.createElement('input')
          input.type = 'file'
          input.addEventListener('change', (event) => {
            if (event.target && event.target.files && event.target.files.length > 0) {
              const file = event.target.files[0]
              const filePath = channelUtil.getWebFilePath(file)
              channelUtil.send({ event: 'file-upload', data: filePath }).then((fileInfo) => {
                insertFileToEditor(fileInfo)
              }).catch(() => {})
            }
          })
          input.click()
          runWithEditor(view => view.focus())
        },
      },
      video: {
        label: t('editor.video'),
        icon: 'i-tabler:video',
        menuList: [
          {
            label: t('editor.insertTemplate'),
            action: () => runWithEditor(view => editorUtil.video(view)),
          },
          {
            label: t('editor.localVideo'),
            action: () => runWithEditor(view => editorUtil.videoLocal(view)),
          },
        ],
      },
      audio: {
        label: t('editor.audio'),
        icon: 'i-tabler:device-audio-tape',
        menuList: [
          {
            label: t('editor.insertTemplate'),
            action: () => runWithEditor(view => editorUtil.audio(view)),
          },
          {
            label: t('editor.localAudio'),
            action: () => runWithEditor(view => editorUtil.audioLocal(view)),
          },
        ],
      },
      undo: {
        label: t('editor.undo'),
        icon: 'i-tabler:arrow-back-up',
        shortcutKey: 'Ctrl+z',
        action: () => runWithEditor(view => editorUtil.undo(view)),
      },
      redo: {
        label: t('editor.redo'),
        icon: 'i-tabler:arrow-forward-up',
        shortcutKey: 'Ctrl+y',
        action: () => runWithEditor(view => editorUtil.redo(view)),
      },
      textColor: {
        label: t('editor.textColor'),
        icon: 'i-tabler:color-picker',
        popover: createVNode(ColorPicker, {
          'is-widget': true,
          'picker-type': 'chrome',
          'use-type': 'both',
          'onPureColorChange': onTextColorChange,
          'onGradientColorChange': onTextColorChange,
        }, { extra: () => h('div', {}, t('editor.textColorTip')) }),
      },
      focusLine: {
        label: t('shortcutKey.editor-focus-line'),
        icon: 'i-tabler:focus-2',
        shortcutKey: getKeymapByShortcutKeyId('editor-focus-line'),
        action: jumpToTargetLine,
      },
      previewVisible: {
        label: t('editor.preview'),
        icon: 'i-tabler:eye',
        action: () => {
          previewVisible.value = !previewVisible.value
        },
      },
      menuVisible: {
        label: t('outline'),
        icon: 'i-tabler:menu-2',
        action: () => {
          if (previewRef.value) {
            menuVisible.value = !menuVisible.value
          } else {
            message.warning(t('editor.outlineTip'))
          }
        },
      },
      prettier: {
        label: t('editor.prettier'),
        icon: 'i-tabler:circle-letter-p',
        action: () => runWithEditor(view => editorUtil.doPrettier(view)),
      },
      save: {
        label: t('shortcutKey.save'),
        icon: 'i-tabler:file-check',
        shortcutKey: getKeymapByShortcutKeyId('save'),
        action: () => runWithEditor(view => emits('save', view.state.doc.toString())),
      },
    }
    return Object.values(defaultToolbar)
  }

  return {
    buildToolbarList,
    getKeymapByShortcutKeyId,
  }
}
