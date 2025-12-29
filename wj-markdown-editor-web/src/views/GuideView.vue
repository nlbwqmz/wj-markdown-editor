<script setup>
import MarkdownMenu from '@/components/editor/MarkdownMenu.vue'
import MarkdownPreview from '@/components/editor/MarkdownPreview.vue'
import OtherLayout from '@/components/layout/OtherLayout.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import guideUtil from '@/util/guideUtil.js'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const content = ref(guideUtil.getGuideContent())
const previewContainerRef = ref()
const anchorList = ref([])

watch(() => useCommonStore().config.language, () => {
  window.document.title = t('topMenu.help.children.example')
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
    <div class="allow-search grid grid-cols-[200px_1fr] h-full w-full overflow-hidden b-t-1 b-t-border-primary b-t-solid">
      <MarkdownMenu :anchor-list="anchorList" :get-container="() => previewContainerRef" class="b-r-1 b-r-border-primary b-r-solid" />
      <div v-if="content" ref="previewContainerRef" class="wj-scrollbar h-full w-full overflow-y-auto">
        <div class="h-full w-full flex justify-center">
          <div class="h-full w-full">
            <MarkdownPreview :content="content" code-theme="atom-one-dark" preview-theme="github" @anchor-change="onAnchorChange" />
          </div>
        </div>
      </div>
    </div>
  </OtherLayout>
</template>

<style scoped lang="scss">

</style>
