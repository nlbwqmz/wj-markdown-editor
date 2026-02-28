<script setup>
import IconButton from '@/components/editor/IconButton.vue'

defineProps({
  toolbarList: {
    type: Array,
    default: () => [],
  },
})
</script>

<template>
  <div
    class="w-full flex flex-wrap items-center justify-start flex-gap2 border-b-1 border-t-1 border-b-border-primary border-t-border-primary border-b-solid border-t-solid p-1"
  >
    <IconButton
      v-for="(item, index) in toolbarList"
      :key="index"
      :icon="item.icon"
      :label="item.label"
      :shortcut-key="item.shortcutKey"
      :menu-list="item.menuList"
      :action="item.action"
      :popover="item.popover"
    />
  </div>
</template>
