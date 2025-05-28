<script setup>
import CommonVNode from '@/components/CommonVNode.vue'
import { isVNode } from 'vue'

const props = defineProps({
  label: {
    type: String,
    required: false,
  },
  shortcutKey: {
    type: String,
    required: false,
  },
  icon: {
    type: String,
    required: true,
  },
  menuList: {
    type: Array,
    required: false,
    default: () => [],
  },
  action: {
    type: Function,
    required: false,
  },
  popover: {
    type: Object,
    required: false,
  },
})

function handleMenuClick({ item }) {
  item.originItemValue.action && item.originItemValue.action()
}
</script>

<template>
  <a-popover v-if="popover && isVNode(popover)" placement="bottom" color="var(--wj-markdown-bg-tertiary)">
    <template #content>
      <CommonVNode :content="popover" />
    </template>
    <div
      class="h-6 w-6 flex cursor-pointer items-center justify-center border-rd p-0.5 font-size-4.5 text-text-secondary hover:bg-bg-hover"
    >
      <a-tooltip placement="topLeft" color="#1677ff">
        <template #title>
          <div v-if="shortcutKey" class="flex gap-2">
            <div>{{ label }}</div>
            <div>{{ shortcutKey }}</div>
          </div>
          <span v-else>{{ label }}</span>
        </template>
        <i :class="props.icon" />
      </a-tooltip>
    </div>
  </a-popover>
  <a-dropdown
    v-else-if="menuList && menuList.length > 0"
    :trigger="['hover']"
    class="select-none"
    arrow
    placement="bottom"
  >
    <div
      class="h-6 w-6 flex cursor-pointer items-center justify-center border-rd p-0.5 font-size-4.5 text-text-secondary hover:bg-bg-hover"
    >
      <a-tooltip placement="topLeft" color="#1677ff">
        <template #title>
          <div v-if="shortcutKey" class="flex gap-2">
            <div>{{ label }}</div>
            <div>{{ shortcutKey }}</div>
          </div>
          <span v-else>{{ label }}</span>
        </template>
        <i :class="props.icon" />
      </a-tooltip>
    </div>
    <template #overlay>
      <a-menu
        mode="vertical"
        :items="menuList"
        @click="handleMenuClick"
      />
    </template>
  </a-dropdown>
  <div
    v-else
    class="h-6 w-6 flex cursor-pointer items-center justify-center border-rd p-0.5 font-size-4.5 text-text-secondary hover:bg-bg-hover"
    @click="action"
  >
    <a-tooltip placement="topLeft" color="#1677ff">
      <template #title>
        <div v-if="shortcutKey" class="flex gap-2">
          <div>{{ label }}</div>
          <div>{{ shortcutKey }}</div>
        </div>
        <span v-else>{{ label }}</span>
      </template>
      <i :class="props.icon" />
    </a-tooltip>
  </div>
</template>
