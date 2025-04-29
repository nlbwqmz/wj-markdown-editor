<script setup>
import MarkdownMenu from '@/components/editor/MarkdownMenu.vue'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import { useCommonStore } from '@/stores/counter.js'
import sendUtil from '@/util/channel/sendUtil.js'
import dayjs from 'dayjs'
import Split from 'split-grid'
import { nextTick, onActivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const content = ref('')
const anchorList = ref([])
let splitInstance
const gutterRef = ref()
const previewContainerRef = ref()
const menuVisible = ref(false)
const menuController = ref(false)
const previewContainer = ref()
const config = ref({})
const ready = ref(false)

const watermark = ref()

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

onMounted(() => {
  menuVisible.value = useCommonStore().config.menuVisible
})

watch(() => menuVisible.value, (newValue) => {
  if (newValue) {
    menuController.value = true
    nextTick(() => {
      splitInstance = Split({
        columnGutters: [{ track: 1, element: gutterRef.value }],
        // 最小尺寸
        minSize: 200,
        // 自动吸附距离
        snapOffset: 0,
      })
    })
  } else {
    splitInstance.destroy(true)
    previewContainer.value.style['grid-template-columns'] = ''
    menuController.value = false
  }
})

onActivated(async () => {
  const data = await sendUtil.send({ event: 'get-file-info' })
  content.value = data.content
  nextTick(() => {
    ready.value = true
  }).then(() => {})
  window.document.title = data.fileName === 'Unnamed' ? 'wj-markdown-editor' : data.fileName
  useCommonStore().$patch({
    fileName: data.fileName,
    saved: data.saved,
  })
  if (!content.value) {
    anchorList.value = []
  }
})

function toEdit() {
  router.push({
    name: 'editor',
  })
}

function onAnchorChange(changedAnchorList) {
  anchorList.value = changedAnchorList
}

function onImageContextmenu(src) {
  sendUtil.send({ event: 'open-folder', data: src })
}
</script>

<template>
  <a-tooltip v-if="menuController === false" placement="right" color="#1677ff">
    <template #title>
      <span>目录</span>
    </template>
    <div class="absolute left-0 top-2 z-10 flex cursor-pointer items-center bg-gray-200 p-1 op-60 hover:op-100" @click="() => { menuVisible = true }">
      <div class="i-tabler:menu-2" />
    </div>
  </a-tooltip>
  <div
    v-show="ready" ref="previewContainer"
    class="allow-search grid h-full w-full overflow-hidden b-t-1 b-t-gray-200 b-t-solid"
    :class="menuController ? 'grid-cols-[200px_2px_1fr]' : 'grid-cols-[1fr]'"
  >
    <MarkdownMenu v-if="menuController" :anchor-list="anchorList" :get-container="() => previewContainerRef" :close="() => { menuVisible = false }" class="b-r-1 b-r-gray-200 b-r-solid" />
    <div v-if="menuController" ref="gutterRef" class="h-full cursor-col-resize bg-[#E2E2E2] op-0" />
    <div v-if="content" ref="previewContainerRef" class="wj-scrollbar h-full w-full overflow-y-auto">
      <div class="h-full w-full flex justify-center">
        <div class="h-full w-full" :style="{ width: `${config.previewWidth}%` }">
          <MarkdownPreview :content="content" :code-theme="config.theme.code" :preview-theme="config.theme.preview" :watermark="watermark" @anchor-change="onAnchorChange" @image-contextmenu="onImageContextmenu" />
        </div>
      </div>
    </div>
    <div v-else class="h-full flex items-center justify-center">
      <a-empty>
        <template #description>
          <span>
            文档内容为空
          </span>
        </template>
        <a-button type="primary" ghost @click="toEdit">
          去编辑
        </a-button>
      </a-empty>
    </div>
  </div>
</template>

<style scoped lang="scss">
</style>
