<template>
  <Teleport to="body">
    <md-preview :model-value="content" :editor-id="editorId" id="export"
                :preview-theme="config.previewTheme"
                :code-theme="config.codeTheme"
                @on-html-changed="handleHtmlChanged()"
    ></md-preview>
  </Teleport>
</template>

<script setup>
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { computed, onBeforeMount, ref } from 'vue'
import nodeRequestUtil from '@/util/nodeRequestUtil'
// import html2pdf from 'html2pdf.js'
import store from '@/store'
import commonUtil from '@/util/commonUtil'
const content = ref()
const editorId = commonUtil.createId()
const id = commonUtil.getUrlParam('id')
onBeforeMount(async () => {
  document.getElementById('app').style.display = 'none'
  const fileContent = await nodeRequestUtil.getFileContent(id)
  content.value = fileContent.content
})
const config = computed(() => store.state.config)

const handleHtmlChanged = commonUtil.debounce(() => {
  window.node?.executeExportPdf()
})
</script>

<style lang="less" scoped>
:deep(.code-block) {
  white-space: pre-wrap;
}
</style>
