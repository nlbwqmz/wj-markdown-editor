<template>
  <Teleport to="body">
    <a-watermark
      v-bind="config.watermark"
      v-if="config.watermark_enabled"
    >
      <md-preview
        :model-value="content"
        :editor-id="editorId"
        id="export"
        :preview-theme="config.preview_theme"
        :code-theme="config.code_theme"
        :show-code-row-number="config.show_code_row_number"
        :code-foldable="false"
        @on-html-changed="handleHtmlChanged()"
      ></md-preview>
    </a-watermark>
    <md-preview
      :model-value="content"
      :editor-id="editorId"
      id="export"
      :preview-theme="config.preview_theme"
      :code-theme="config.code_theme"
      @on-html-changed="handleHtmlChanged()"
      v-else
    ></md-preview>
    <div
      v-show="showInfo"
      style="font-size: 12px; text-align: center; width: 100%; color: #8b949e;padding: 10px 0"
    >
      图片由wj-markdown-editor导出
    </div>
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
import html2canvas from 'html2canvas'
const content = ref()
const editorId = commonUtil.createId()
const id = commonUtil.getUrlParam('id')
const type = commonUtil.getUrlParam('type')
const showInfo = ref(false)
onBeforeMount(async () => {
  if (type !== 'pdf') {
    showInfo.value = true
  }
  document.getElementById('app').style.display = 'none'
  const fileContent = await nodeRequestUtil.getFileContent(id)
  content.value = fileContent.content
})
const config = computed(() => {
  const originConfig = commonUtil.deepCopy(store.state.config)
  if (originConfig.watermark_enabled === true) {
    originConfig.watermark = {
      font: {
        color: originConfig.watermark_font_color,
        size: originConfig.watermark_font_size,
        weight: originConfig.watermark_font_weight
      },
      gap: originConfig.watermark_gap,
      rotate: originConfig.watermark_rotate,
      content: originConfig.watermark_content
    }
    if (originConfig.watermark_export_date === true) {
      originConfig.watermark.content = [originConfig.watermark.content, dayjs(new Date()).format(originConfig.watermark_export_date_format)]
    }
  }
  return originConfig
})

const handleHtmlChanged = commonUtil.debounce(() => {
  if (type === 'pdf') {
    nodeRequestUtil.executeConvertFile('pdf')
  } else {
    html2canvas(document.body, {
      allowTaint: true
    }).then(canvas => {
      const base64 = canvas.toDataURL(`image/${type}`, 1)
      nodeRequestUtil.executeConvertFile(type, base64)
    })
  }
}, 1000)
</script>

<style lang="less" scoped>
:deep(.md-editor-code-block) {
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

:deep(.md-editor-code-head){
  display: none !important;
}
</style>
