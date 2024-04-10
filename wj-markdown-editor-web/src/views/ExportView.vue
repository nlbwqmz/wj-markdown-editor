<template>
  <wj-modal :action="[{key: 'close', click: nodeRequestUtil.closeExportWin}]">
    <template #title>
      <ExportOutlined />
      <span style="padding-left: 10px">导出</span>
    </template>
    <div style="display: flex; flex-direction: column">
      <div style="flex: 1; overflow: auto; max-height: calc(100vh - 100px)" class="wj-scrollbar">
        <md-preview :model-value="content" :editor-id="editorId" id="export"
                    :preview-theme="config.previewTheme"
                    :code-theme="config.codeTheme"
        ></md-preview>
      </div>
      <div style="text-align: center;position: fixed; bottom: 0; width: 100%; padding: 10px 0">
        <a-button @click="onHtmlChanged">导出</a-button>
      </div>
    </div>
  </wj-modal>
</template>

<script setup>
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { computed, onActivated, ref } from 'vue'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import html2pdf from 'html2pdf.js'
import { ExportOutlined } from '@ant-design/icons-vue'
import WjModal from '@/components/WjModal.vue'
import store from '@/store'
import commonUtil from '@/util/commonUtil'
import { Modal } from 'ant-design-vue'
const content = ref()
const editorId = commonUtil.createId()
const id = commonUtil.getUrlParam('id')
onActivated(async () => {
  const fileContent = await nodeRequestUtil.getFileContent(id)
  if (fileContent.exists === true) {
    content.value = fileContent.content
  } else {
    Modal.warning({
      title: '提示',
      content: '未找到当前文件',
      maskClosable: false,
      closable: false,
      onOk: nodeRequestUtil.closeExportWin
    })
  }
})

const onHtmlChanged = () => {
  const element = document.getElementById('export')
  html2pdf().set(
    {
      margin: 10,
      // filename: '导出的文档.pdf',
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }
  ).from(element).save()
}
const config = computed(() => store.state.config)
</script>

<style lang="less" scoped>
:deep(.code-block) {
  white-space: pre-wrap;
}
//&::-webkit-scrollbar
//{
//  width: 6px;  /*滚动条宽度*/
//  height: 6px;  /*滚动条高度*/
//}
//
///*定义滚动条轨道 内阴影+圆角*/
//&::-webkit-scrollbar-track
//{
//  background-color: #e2e2e2;
//  border-radius: 2px;  /*滚动条的背景区域的圆角*/
//}
//
///*定义滑块 内阴影+圆角*/
//&::-webkit-scrollbar-thumb
//{
//  border-radius: 2px;
//  background-color: #0000004d;
//}

</style>
