<script setup>
import commonUtil from '@/util/commonUtil.js'

defineProps({
  anchorList: {
    type: Array,
    default: () => [],
  },
  getContainer: {
    type: Function,
    default: () => document.body,
  },
  close: {
    type: Function,
    default: null,
  },
})

/**
 * 监听激活锚点更该事件 保持激活的锚点在容器中间
 */
const onActiveAnchorChanged = commonUtil.debounce(() => {
  const activeAnchor = document.querySelector('.ant-anchor-link-title-active')
  if (activeAnchor) {
    activeAnchor.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    })
  }
}, 100)
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden">
    <div class="flex items-center b-b-1 b-b-gray-200 b-b-solid p-2 font-size-3 color-gray-500" :class="close ? 'justify-between' : 'justify-center'">
      <div class="select-none">
        目录
      </div>
      <div v-if="close" class="i-tabler:x cursor-pointer" @click="close" />
    </div>
    <div class="wj-scrollbar relative h-0 h-full flex-1 overflow-y-auto p-l-4 p-r-4">
      <div v-if="!anchorList || anchorList.length === 0" class="h-full flex items-center justify-center">
        <a-empty>
          <template #description>
            <span class="color-gray-500">暂无目录</span>
          </template>
        </a-empty>
      </div>
      <a-anchor
        v-else
        :affix="false"
        :items="anchorList"
        :get-container="getContainer"
        @change="onActiveAnchorChanged"
        @click="(e) => { e.preventDefault() }"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">

</style>
