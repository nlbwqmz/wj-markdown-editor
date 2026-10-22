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
  // 关闭后只渲染图标，不再挂载 a-tooltip；用于 hover 弹出菜单/popover 的按钮，避免浮层互相干扰
  showTooltip: {
    type: Boolean,
    default: true,
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
    // 动作可能返回 Promise（新建文件/文件夹要走 IPC）。
    // 失败提示由动作自己负责，这里只兜住漏网的拒绝，
    // 避免变成 unhandled rejection 而让界面看起来“点了没反应”。
    const actionResult = action()
    if (actionResult && typeof actionResult.catch === 'function') {
      actionResult.catch(() => {})
    }
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
      <a-tooltip v-if="showTooltip" placement="topLeft" color="#1677ff">
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
      <i v-else :class="props.icon" />
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
      <a-tooltip v-if="showTooltip" placement="topLeft" color="#1677ff">
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
      <i v-else :class="props.icon" />
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
    <a-tooltip v-if="showTooltip" placement="topLeft" color="#1677ff">
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
    <i v-else :class="props.icon" />
  </div>
</template>
