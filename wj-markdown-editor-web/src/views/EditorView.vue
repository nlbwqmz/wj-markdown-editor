<script setup>
import MarkdownEdit from '@/components/editor/MarkdownEdit.vue'
import { useCommonStore } from '@/stores/counter.js'
import sendUtil from '@/util/channel/sendUtil.js'
import dayjs from 'dayjs'
import { onMounted, ref, watch } from 'vue'

const content = ref('')
// 确保content已获取再传入组件
const ready = ref(false)
const watermark = ref()
const config = ref()
function save() {
  sendUtil.send({ event: 'save' })
}
function updateFileInfo(data) {
  content.value = data.content
  ready.value = true
  window.document.title = data.fileName === 'Unnamed' ? 'wj-markdown-editor' : data.fileName
  useCommonStore().$patch({
    fileName: data.fileName,
    saved: data.saved,
  })
}
onMounted(async () => {
  const data = await sendUtil.send({ event: 'get-file-info' })
  updateFileInfo(data)
})
watch(() => content.value, (newValue, oldValue) => {
  if (newValue !== oldValue) {
    sendUtil.send({ event: 'file-content-update', data: newValue })
  }
})

watch(() => useCommonStore().config, (newValue) => {
  // 水印
  const tempWatermark = JSON.parse(JSON.stringify(newValue.watermark))
  tempWatermark.content = tempWatermark.content ? tempWatermark.content : 'wj-markdown-editor'
  if (tempWatermark.dateEnabled === true) {
    tempWatermark.content = [tempWatermark.content, dayjs(new Date()).format(tempWatermark.datePattern)]
  }
  tempWatermark.enabled = tempWatermark.enabled && tempWatermark.previewEnabled
  watermark.value = tempWatermark
  config.value = newValue
}, { deep: true, immediate: true })

function onImageContextmenu(src) {
  sendUtil.send({ event: 'open-folder', data: src })
}
</script>

<template>
  <MarkdownEdit v-if="ready" v-model="content" class="h-full" :code-theme="config.theme.code" :preview-theme="config.theme.preview" :watermark="watermark" @save="save" @image-contextmenu="onImageContextmenu" />
</template>

<style scoped lang="scss">
</style>
