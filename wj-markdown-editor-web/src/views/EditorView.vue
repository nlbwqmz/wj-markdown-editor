<script setup>
import dayjs from 'dayjs'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MarkdownEdit from '@/components/editor/MarkdownEdit.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import eventEmit from '@/util/channel/eventEmit.js'
import commonUtil from '@/util/commonUtil.js'

const content = ref('')
// 确保content已获取再传入组件
const ready = ref(false)
const store = useCommonStore()
const watermark = ref()
const config = ref()

function save() {
  channelUtil.send({ event: 'save' })
}

function syncFileMeta(data) {
  window.document.title = data.fileName === 'Unnamed' ? 'wj-markdown-editor' : data.fileName
  store.$patch({
    fileName: data.fileName,
    saved: data.saved,
  })
}

function updateFileInfo(data, options = { syncMeta: true }) {
  if (data.isRecent && !data.exists) {
    commonUtil.recentFileNotExists(data.path)
  }
  // 这里接收的是 Electron 最终确认后的内容：
  // - 初次打开文件
  // - 自动应用外部修改
  // - 用户在弹窗里手动应用外部修改
  content.value = data.content
  ready.value = true
  if (options.syncMeta === true) {
    syncFileMeta(data)
  }
}

function onFileContentReloaded(data) {
  // fileName / saved / title 由全局事件层统一更新，
  // 这里仅刷新编辑内容，避免重复状态同步。
  updateFileInfo(data, { syncMeta: false })
}

onMounted(async () => {
  // 页面初始化时先拉一份当前窗口的文件状态，
  // 后续如果 Electron 主动刷新内容，会再通过 `file-content-reloaded` 推过来。
  const data = await channelUtil.send({ event: 'get-file-info' })
  updateFileInfo(data, { syncMeta: true })
  eventEmit.on('file-content-reloaded', onFileContentReloaded)
})

onBeforeUnmount(() => {
  eventEmit.remove('file-content-reloaded', onFileContentReloaded)
})

watch(() => content.value, (newValue, oldValue) => {
  if (newValue !== oldValue) {
    // 编辑器里每次真实内容变化，都会同步给 Electron 更新 tempContent。
    // 保存状态、外部变更收敛等逻辑都在 Electron 侧统一判断。
    channelUtil.send({ event: 'file-content-update', data: newValue })
  }
})

watch(() => store.config, (newValue) => {
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
  channelUtil.send({ event: 'open-folder', data: src })
}
</script>

<template>
  <MarkdownEdit v-if="ready" v-model="content" :association-highlight="config.editor.associationHighlight" :extension="config.editorExtension" class="h-full" :code-theme="config.theme.code" :preview-theme="config.theme.preview" :watermark="watermark" :theme="config.theme.global" @save="save" @image-contextmenu="onImageContextmenu" />
</template>

<style scoped lang="scss">
</style>
