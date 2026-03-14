<script setup>
import dayjs from 'dayjs'
import Split from 'split-grid'
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownMenu from '@/components/editor/MarkdownMenu.vue'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import eventEmit from '@/util/channel/eventEmit.js'
import { previewSearchBarController } from '@/util/searchBarController.js'
import { closeSearchBarIfVisible } from '@/util/searchBarLifecycleUtil.js'
import { collectSearchTargetElements } from '@/util/searchTargetUtil.js'

const router = useRouter()

const store = useCommonStore()

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
let previewSearchTargetActive = false

const watermark = ref()

function getPreviewSearchTargetElements() {
  return collectSearchTargetElements(previewContainer.value)
}

const previewSearchTargetProvider = () => getPreviewSearchTargetElements()

function activatePreviewSearchTarget() {
  if (previewSearchTargetActive === true) {
    return
  }
  previewSearchTargetActive = true
  previewSearchBarController.registerTargetProvider(previewSearchTargetProvider)
}

function deactivatePreviewSearchTarget() {
  if (previewSearchTargetActive === false) {
    return
  }
  previewSearchTargetActive = false
  previewSearchBarController.unregisterTargetProvider(previewSearchTargetProvider)
}

function closePreviewSearchBar() {
  closeSearchBarIfVisible({
    controller: previewSearchBarController,
    store,
  })
}

function syncFileMeta(data) {
  window.document.title = data.fileName === 'Unnamed' ? 'wj-markdown-editor' : data.fileName
  store.$patch({
    fileName: data.fileName,
    saved: data.saved,
  })
}

function updateFileInfo(data, options = { syncMeta: true }) {
  // 预览页也是被动接收 Electron 已确认的最终内容，
  // 不参与外部修改的应用决策，只负责展示结果。
  content.value = data.content
  ready.value = true
  if (options.syncMeta === true) {
    syncFileMeta(data)
  }
  if (!content.value) {
    anchorList.value = []
  }
}

function onFileContentReloaded(data) {
  // fileName / saved / title 由全局事件层统一更新，
  // 这里仅刷新预览内容，避免重复状态同步。
  updateFileInfo(data, { syncMeta: false })
}

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

onMounted(() => {
  menuVisible.value = store.config.menuVisible
  activatePreviewSearchTarget()
  // 当 Electron 自动应用外部修改，或者用户手动应用完成后，
  // 预览页会收到统一的刷新事件。
  eventEmit.on('file-content-reloaded', onFileContentReloaded)
})

onBeforeUnmount(() => {
  closePreviewSearchBar()
  deactivatePreviewSearchTarget()
  eventEmit.remove('file-content-reloaded', onFileContentReloaded)
})

watch(() => menuVisible.value, (newValue) => {
  closePreviewSearchBar()

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
  activatePreviewSearchTarget()
  closePreviewSearchBar()
  const data = await channelUtil.send({ event: 'get-file-info' })
  updateFileInfo(data, { syncMeta: true })
})

onDeactivated(() => {
  closePreviewSearchBar()
  deactivatePreviewSearchTarget()
})

function toEdit() {
  router.push({
    name: 'editor',
  })
}

function onAnchorChange(changedAnchorList) {
  anchorList.value = changedAnchorList
}

function onPreviewRefreshComplete() {
  closePreviewSearchBar()
}

function onAssetContextmenu(assetInfo) {
  channelUtil.send({
    event: 'open-folder',
    data: {
      resourceUrl: assetInfo.resourceUrl,
      rawPath: assetInfo.rawPath,
    },
  })
}

function onAssetOpen(assetInfo) {
  if (!assetInfo?.resourceUrl) {
    return
  }
  channelUtil.send({
    event: 'open-folder',
    data: {
      resourceUrl: assetInfo.resourceUrl,
      rawPath: assetInfo.rawPath,
    },
  })
}
</script>

<template>
  <a-tooltip v-if="menuController === false" placement="right" color="#1677ff">
    <template #title>
      <span>{{ $t('outline') }}</span>
    </template>
    <div class="absolute left-0 z-10 flex cursor-pointer items-center p-1 op-60 hover:op-100" @click="() => { menuVisible = true }">
      <div class="i-tabler:menu-2" />
    </div>
  </a-tooltip>
  <div
    v-show="ready" ref="previewContainer"
    class="allow-search grid h-full w-full overflow-hidden b-t-1 b-t-border-primary b-t-solid"
    :class="menuController ? 'grid-cols-[200px_2px_1fr]' : 'grid-cols-[1fr]'"
  >
    <MarkdownMenu v-if="menuController" :anchor-list="anchorList" :get-container="() => previewContainerRef" :close="() => { menuVisible = false }" class="b-r-1 b-r-border-primary b-r-solid" />
    <div v-if="menuController" ref="gutterRef" class="h-full cursor-col-resize bg-[#E2E2E2] op-0" />
    <div v-if="content" ref="previewContainerRef" class="wj-scrollbar h-full w-full overflow-y-auto">
      <div class="h-full w-full flex justify-center">
        <div class="h-full w-full" :style="{ width: `${config.previewWidth}%` }">
          <MarkdownPreview :content="content" :code-theme="config.theme.code" :preview-theme="config.theme.preview" :watermark="watermark" @refresh-complete="onPreviewRefreshComplete" @anchor-change="onAnchorChange" @asset-contextmenu="onAssetContextmenu" @asset-open="onAssetOpen" />
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
