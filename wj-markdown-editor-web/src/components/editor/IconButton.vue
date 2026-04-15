<script setup>
import { computed, isVNode } from 'vue'
import CommonVNode from '@/components/CommonVNode.vue'

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
  menuTrigger: {
    type: Array,
    required: false,
    default: () => ['hover'],
  },
  menuSelectedKeys: {
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

const resolvedMenuList = computed(() => {
  return (props.menuList || []).map((item, index) => ({
    ...item,
    key: item?.key ?? String(index),
  }))
})

function resolveMenuAction(menuInfo) {
  const matchedMenuItem = resolvedMenuList.value.find(item => String(item?.key) === String(menuInfo?.key))

  return matchedMenuItem?.action || menuInfo?.item?.originItemValue?.action || null
}

function handleMenuClick(menuInfo) {
  const action = resolveMenuAction(menuInfo)
  if (typeof action === 'function') {
    action()
  }
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
            <div class="color-[rgb(200,200,200)]">
              {{ shortcutKey }}
            </div>
          </div>
          <span v-else>{{ label }}</span>
        </template>
        <i :class="props.icon" />
      </a-tooltip>
    </div>
  </a-popover>
  <a-dropdown
    v-else-if="menuList && menuList.length > 0"
    :trigger="menuTrigger"
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
            <div class="color-[rgb(200,200,200)]">
              {{ shortcutKey }}
            </div>
          </div>
          <span v-else>{{ label }}</span>
        </template>
        <i :class="props.icon" />
      </a-tooltip>
    </div>
    <template #overlay>
      <a-menu
        mode="vertical"
        :items="resolvedMenuList"
        :selected-keys="menuSelectedKeys"
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
          <div class="color-[rgb(200,200,200)]">
            {{ shortcutKey }}
          </div>
        </div>
        <span v-else>{{ label }}</span>
      </template>
      <i :class="props.icon" />
    </a-tooltip>
  </div>
</template>
