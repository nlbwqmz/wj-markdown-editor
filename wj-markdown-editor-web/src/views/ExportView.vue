<template>
  <Teleport to="body">
    <a-watermark v-bind="config.watermark" v-if="config.watermark.enabled">
      <md-preview :model-value="content" :editor-id="editorId" id="export"
                  :preview-theme="config.previewTheme"
                  :code-theme="config.codeTheme"
                  @on-html-changed="handleHtmlChanged()"
      ></md-preview>
    </a-watermark>
    <md-preview :model-value="content" :editor-id="editorId" id="export"
                :preview-theme="config.previewTheme"
                :code-theme="config.codeTheme"
                @on-html-changed="handleHtmlChanged()"
                v-else
    ></md-preview>
  </Teleport>
</template>

<script setup>
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { computed, onBeforeMount, ref } from 'vue'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import store from '@/store'
import commonUtil from '@/util/commonUtil'
import dayjs from 'dayjs'
const content = ref()
const editorId = commonUtil.createId()
const id = commonUtil.getUrlParam('id')
onBeforeMount(async () => {
  document.getElementById('app').style.display = 'none'
  const fileContent = await nodeRequestUtil.getFileContent(id)
  content.value = fileContent.content
})
const config = computed(() => {
  const originConfig = commonUtil.deepCopy(store.state.config)
  if (originConfig.watermark.enabled === true) {
    if (originConfig.watermark.exportDate === true) {
      originConfig.watermark.content = [originConfig.watermark.content, dayjs(new Date()).format(originConfig.watermark.exportDateFormat)]
    }
  }
  return originConfig
})

const handleHtmlChanged = commonUtil.debounce(() => {
  window.node?.executeExportPdf()
}, 1000)
</script>

<style lang="less" scoped>
:deep(.code-block) {
  white-space: pre-wrap;
}
:deep(.default-theme pre code span[rn-wrapper]){
  top: 1em;
}
:deep(.default-theme pre:before){
  height: 0;
}

:deep(.default-theme pre code) {
  border-radius: 5px;
}
</style>
