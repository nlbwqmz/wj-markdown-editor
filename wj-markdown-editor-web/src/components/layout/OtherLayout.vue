<script setup>
const props = defineProps({
  icon: {
    type: String,
  },
  name: {
    type: String,
  },
})
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden bg-bg-primary text-text-primary">
    <div class="w-full flex items-center overflow-hidden">
      <div class="electron-drag flex items-center gap-1 p-2">
        <div :class="props.icon" />
        <div class="flex items-center justify-center font-size-3.5">
          <span>{{ props.name }}</span>
        </div>
      </div>
      <div class="electron-drag h-full flex-1" />
      <div class="flex items-center">
        <slot name="action" />
      </div>
    </div>
    <div id="wj-other-layout-container" class="wj-scrollbar relative h-0 w-full flex-1 overflow-auto">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">

</style>
