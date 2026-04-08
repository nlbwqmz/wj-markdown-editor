<script setup>
import dayjs from 'dayjs'
import { onBeforeMount, ref, watch } from 'vue'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import commonUtil from '@/util/commonUtil.js'
import { requestDocumentSessionSnapshot } from '@/util/document-session/rendererDocumentCommandUtil.js'
import { waitForExportRenderSettled } from '@/util/exportRenderReadyUtil.js'

const content = ref('')
const config = ref()
const watermark = ref()
let exportWaitingStarted = false

async function waitingExport({ type, target, filePath }) {
  if (exportWaitingStarted) {
    return
  }
  exportWaitingStarted = true
  if (type === 'PDF' && document.documentElement.getAttribute('theme') !== 'light') {
    document.documentElement.setAttribute('theme', 'light')
  }
  await waitForExportRenderSettled({
    themeName: config.value?.theme?.code,
    images: document.querySelectorAll('img'),
  })
  channelUtil.send({
    event: 'export-end',
    data: {
      type,
      target,
      filePath: filePath || null,
    },
  })
}

onBeforeMount(async () => {
  const snapshot = await requestDocumentSessionSnapshot()
  // 导出页只需要当前正文内容；
  // 这里直接从 session snapshot 读取，避免继续依赖历史兼容返回结构。
  content.value = snapshot?.content || ''
  // 隐藏滚动条 （一次性页面 直接设置即可）防止打印出滚动条
  document.body.classList.add('wj-scrollbar-hide')
})
function onRefreshComplete() {
  const type = commonUtil.getUrlParam('type')
  const target = commonUtil.getUrlParam('target')
  const filePath = commonUtil.getUrlParam('filePath')
  // 展开details
  const detailsAll = document.querySelectorAll('details')
  if (detailsAll) {
    for (const item of detailsAll) {
      item.open = true
    }
  }
  waitingExport({ type, target, filePath }).then(() => {})
}

watch(() => useCommonStore().config, (newValue) => {
  // 水印
  const tempWatermark = JSON.parse(JSON.stringify(newValue.watermark))
  tempWatermark.content = tempWatermark.content ? tempWatermark.content : 'wj-markdown-editor'
  if (tempWatermark.dateEnabled === true) {
    tempWatermark.content = [tempWatermark.content, dayjs(new Date()).format(tempWatermark.datePattern)]
  }
  watermark.value = tempWatermark
  config.value = newValue
}, { deep: true, immediate: true })
</script>

<template>
  <div class="w-full">
    <MarkdownPreview v-if="content" :content="content" :watermark="watermark" :code-theme="config.theme.code" :preview-theme="config.theme.preview" @refresh-complete="onRefreshComplete" />
  </div>
</template>

<style scoped lang="scss">
:deep(code) {
  white-space: pre-wrap !important;
}
</style>
