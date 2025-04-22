<script setup>
import MarkdownEdit from '@/components/editor/MarkdownEdit.vue'
import { useCommonStore } from '@/stores/counter.js'
import sendUtil from '@/util/channel/sendUtil.js'
import { onMounted, ref, watch } from 'vue'

const content = ref('')
// 确保content已获取再传入组件
const ready = ref(false)
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
const theme = ref({ code: '', preview: '' })
watch(() => useCommonStore().config.theme, (newValue) => {
  theme.value = {
    code: newValue.code,
    preview: newValue.preview,
  }
}, { immediate: true, deep: true })
</script>

<template>
  <MarkdownEdit v-if="ready" v-model="content" class="h-full" :code-theme="theme.code" :preview-theme="theme.preview" @save="save" />
</template>

<style scoped lang="scss">
</style>
