import channelUtil from '@/util/channel/channelUtil.js'
import editorUtil from '@/util/editor/editorUtil.js'
import { Form } from 'ant-design-vue'
import { reactive, ref } from 'vue'

/**
 * 编辑器资源插入（图片/文件/拖拽/粘贴）
 */
export function useAssetInsert({ editorViewRef }) {
  const useForm = Form.useForm
  const imageNetworkModel = ref(false)
  const imageNetworkData = reactive({ name: undefined, url: undefined })
  const imageNetworkDataRules = reactive({
    url: [{ required: true, message: '请输入链接' }, { pattern: /^https?:\/\/.+/, message: '链接不正确' }],
  })
  const { validate } = useForm(imageNetworkData, imageNetworkDataRules)

  function getEditorView() {
    return editorViewRef.value
  }

  function insertImageToEditor(imageInfo) {
    const view = getEditorView()
    if (!view || !imageInfo) {
      return
    }
    const to = view.state.selection.main.to
    // 如果当前行不为空，则需要额外换行
    let wrap = false
    const line = view.state.doc.lineAt(to)
    if (line.from !== line.to) {
      wrap = true
    }
    const insert = `${wrap === true ? '\n' : ''}![${imageInfo.name}](<${imageInfo.path}>)`
    view.dispatch({
      changes: { from: to, to, insert },
      selection: { anchor: to + insert.length },
    })
  }

  function insertFileToEditor(fileInfo) {
    const view = getEditorView()
    if (!view || !fileInfo) {
      return
    }
    const to = view.state.selection.main.to
    const insert = `[${fileInfo.name}](<${fileInfo.path}>)`
    view.dispatch({
      changes: { from: to, to, insert },
      selection: { anchor: to + insert.length },
    })
  }

  function openNetworkImageModal() {
    imageNetworkData.name = undefined
    imageNetworkData.url = undefined
    imageNetworkModel.value = true
  }

  async function onInsertImgNetwork() {
    await validate()
    imageNetworkModel.value = false
    const fileInfo = await channelUtil.send({
      event: 'upload-image',
      data: {
        mode: 'network',
        name: imageNetworkData.name,
        url: imageNetworkData.url,
      },
    })
    editorUtil.insertImageToEditor(getEditorView(), fileInfo)
  }

  function pasteOrDrop(event, _view, types, files) {
    if (!types.includes('Files')) {
      return
    }
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i)
      if (file.type && file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = async function (readerEvent) {
          const fileInfo = await channelUtil.send({
            event: 'upload-image',
            data: {
              mode: 'local',
              type: file.type,
              name: file.name,
              base64: readerEvent.target.result,
            },
          })
          insertImageToEditor(fileInfo)
        }
        reader.readAsDataURL(file)
      } else {
        const filePath = channelUtil.getWebFilePath(file)
        channelUtil.send({ event: 'file-upload', data: filePath }).then((fileInfo) => {
          insertFileToEditor(fileInfo)
        }).catch(() => {})
      }
    }
    event.preventDefault()
  }

  return {
    imageNetworkModel,
    imageNetworkData,
    imageNetworkDataRules,
    insertImageToEditor,
    insertFileToEditor,
    openNetworkImageModal,
    onInsertImgNetwork,
    pasteOrDrop,
  }
}
