<script setup>
</script>

<template>
  <div id="layout-container" class="relative h-full w-full overflow-y-auto">
    <router-view v-slot="{ Component }">
      <keep-alive :max="100">
        <component
          :is="Component"
          :key="$route.path"
        />
      </keep-alive>
    </router-view>
  </div>
</template>

<style scoped>

</style>
