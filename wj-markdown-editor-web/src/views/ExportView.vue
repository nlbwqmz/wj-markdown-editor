<script setup>
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import { useCommonStore } from '@/stores/counter.js'
import sendUtil from '@/util/channel/sendUtil.js'
import commonUtil from '@/util/commonUtil.js'
import dayjs from 'dayjs'
import { onBeforeMount, ref, watch } from 'vue'

const content = ref('')

function allImagesLoaded() {
  const images = document.querySelectorAll('img')
  for (let i = 0; i < images.length; i++) {
    // 若complete为true但是img.naturalWidth === 0则表示图片加载失败 这里忽略成功和失败 只需要加载完成
    if (images.item(i).complete === false) {
      return false
    }
  }
  return true
}

function waitingExport(type, filePath) {
  if (allImagesLoaded() === true) {
    sendUtil.send({ event: 'export-end', data: { type, filePath } })
  } else {
    setTimeout(() => waitingExport(type, filePath), 1000)
  }
}

onBeforeMount(async () => {
  const data = await sendUtil.send({ event: 'get-file-info' })
  content.value = data.content
  // 隐藏滚动条 （一次性页面 直接设置即可）防止打印出滚动条
  document.body.classList.add('wj-scrollbar-hide')
})
function onRefreshComplete() {
  const type = commonUtil.getUrlParam('type')
  const filePath = commonUtil.getUrlParam('filePath')
  waitingExport(type, filePath)
}
const config = ref()
const watermark = ref()

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
  <div class="w-full p-4">
    <MarkdownPreview v-if="content" :content="content" :watermark="watermark" :code-theme="config.theme.code" :preview-theme="config.theme.preview" @refresh-complete="onRefreshComplete" />
  </div>
</template>

<style scoped lang="scss">
:deep(code) {
  white-space: pre-wrap !important;
}
</style>
