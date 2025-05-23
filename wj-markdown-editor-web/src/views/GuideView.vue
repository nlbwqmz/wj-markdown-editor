<script setup>
import MarkdownMenu from '@/components/editor/MarkdownMenu.vue'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import OtherLayout from '@/components/layout/OtherLayout.vue'
import channelUtil from '@/util/channel/channelUtil.js'
import guideUtil from '@/util/guideUtil.js'
import { onMounted, ref } from 'vue'

const content = ref(guideUtil.getGuideContent())
const guideContainer = ref()
const previewContainerRef = ref()
const anchorList = ref([])

onMounted(() => {
  window.document.title = '示例'
})

function guideMinimize() {
  channelUtil.send({ event: 'guide-minimize' })
}

function guideClose() {
  channelUtil.send({ event: 'guide-close' })
}

function onAnchorChange(changedAnchorList) {
  anchorList.value = changedAnchorList
}
</script>

<template>
  <OtherLayout icon="i-tabler:settings" name="示例">
    <template #action>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-[rgb(237,237,237)]" @click="guideMinimize">
        <div class="i-tabler:minus" />
      </div>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-red" @click="guideClose">
        <div class="i-tabler:x" />
      </div>
    </template>
    <div
      ref="guideContainer"
      class="allow-search grid grid-cols-[200px_1fr] h-full w-full overflow-hidden b-t-1 b-t-gray-200 b-t-solid"
    >
      <MarkdownMenu :anchor-list="anchorList" :get-container="() => previewContainerRef" class="b-r-1 b-r-gray-200 b-r-solid" />
      <div v-if="content" ref="previewContainerRef" class="wj-scrollbar h-full w-full overflow-y-auto">
        <div class="h-full w-full flex justify-center">
          <div class="h-full w-full">
            <MarkdownPreview :content="content" code-theme="atom-one-dark" preview-theme="cyanosis" @anchor-change="onAnchorChange" />
          </div>
        </div>
      </div>
    </div>
  </OtherLayout>
</template>

<style scoped lang="scss">

</style>
