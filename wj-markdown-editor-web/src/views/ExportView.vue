<script setup>
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import { useCommonStore } from '@/stores/counter.js'
import sendUtil from '@/util/channel/sendUtil.js'
import { onBeforeMount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const content = ref('')
const route = useRoute()

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
  content.value = await sendUtil.send({ event: 'get-temp-content' })
  // 隐藏滚动条 （一次性页面 直接设置即可）防止打印出滚动条
  document.body.classList.add('wj-scrollbar-hide')
})
function onRefreshComplete() {
  const type = route.query.type
  const filePath = route.query.filePath
  waitingExport(type, filePath)
}
const theme = ref({ code: '', preview: '' })
watch(() => useCommonStore().config.theme, (newValue) => {
  theme.value = {
    code: newValue.codeTheme,
    preview: newValue.preview,
  }
}, { immediate: true, deep: true })
</script>

<template>
  <div class="w-full p-4">
    <MarkdownPreview v-if="content" :content="content" :is-preview="false" :code-theme="theme.code" :preview-theme="theme.preview" @refresh-complete="onRefreshComplete" />
  </div>
</template>

<style scoped lang="scss">
:deep(code) {
  white-space: pre-wrap !important;
}
</style>
