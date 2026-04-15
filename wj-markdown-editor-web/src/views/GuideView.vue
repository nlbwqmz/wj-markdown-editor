<script setup>
import Split from 'split-grid'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownMenu from '@/components/editor/MarkdownMenu.vue'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import OtherLayout from '@/components/layout/OtherLayout.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import guideUtil from '@/util/guideUtil.js'
import { previewSearchBarController } from '@/util/searchBarController.js'
import { closeSearchBarIfVisible } from '@/util/searchBarLifecycleUtil.js'
import { createSearchTargetBridge } from '@/util/searchTargetBridgeUtil.js'
import { collectSearchTargetElements } from '@/util/searchTargetUtil.js'

const { t } = useI18n()

const commonStore = useCommonStore()
const content = ref(guideUtil.getGuideContent(commonStore.config.language))
const previewContainerRef = ref()
const guideContainerRef = ref()
const gutterRef = ref()
const anchorList = ref([])
let splitInstance
const guideSearchTargetBridge = createSearchTargetBridge({
  controller: previewSearchBarController,
  getTargetElements: () => collectSearchTargetElements(guideContainerRef.value),
})

watch(() => commonStore.config.language, (language) => {
  window.document.title = t('topMenu.help.children.example')
  content.value = guideUtil.getGuideContent(language)
}, { immediate: true })

function guideMinimize() {
  channelUtil.send({ event: 'guide-minimize' })
}

function guideClose() {
  channelUtil.send({ event: 'guide-close' })
}

function onAnchorChange(changedAnchorList) {
  anchorList.value = changedAnchorList
}

function onPreviewRefreshComplete() {
  closeSearchBarIfVisible({
    controller: previewSearchBarController,
    store: commonStore,
  })
}

onMounted(() => {
  guideSearchTargetBridge.activate()
  splitInstance = Split({
    columnGutters: [{ track: 1, element: gutterRef.value }],
    minSize: 200,
    snapOffset: 0,
  })
})

onUnmounted(() => {
  closeSearchBarIfVisible({
    controller: previewSearchBarController,
    store: commonStore,
  })
  guideSearchTargetBridge.deactivate({ preserveCleanupTarget: false })
  splitInstance?.destroy?.()
})
</script>

<template>
  <OtherLayout icon="i-tabler:bubble-text" :name="$t('topMenu.help.children.example')">
    <template #action>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-bg-hover" @click="guideMinimize">
        <div class="i-tabler:minus" />
      </div>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-red" @click="guideClose">
        <div class="i-tabler:x" />
      </div>
    </template>
    <div ref="guideContainerRef" class="allow-search grid grid-cols-[200px_1px_1fr] h-full w-full overflow-hidden b-t-1 b-t-border-primary b-t-solid">
      <MarkdownMenu :anchor-list="anchorList" :get-container="() => previewContainerRef" :show-header="false" />
      <div ref="gutterRef" class="wj-sash wj-sash--vertical h-full" />
      <div v-if="content" ref="previewContainerRef" class="wj-scrollbar h-full w-full overflow-y-auto">
        <div class="h-full w-full flex justify-center">
          <div class="h-full w-full">
            <MarkdownPreview
              :content="content"
              :code-theme="commonStore.config.theme.code"
              :manage-html-image-resources="false"
              :preview-theme="commonStore.config.theme.preview"
              :preview-scroll-container="() => previewContainerRef"
              @refresh-complete="onPreviewRefreshComplete"
              @anchor-change="onAnchorChange"
            />
          </div>
        </div>
      </div>
    </div>
  </OtherLayout>
</template>

<style scoped lang="scss">

</style>
