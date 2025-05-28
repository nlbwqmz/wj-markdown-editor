<script setup>
import { useCommonStore } from '@/stores/counter.js'
import { watch } from 'vue'

watch(() => useCommonStore().config.theme.global, (newValue) => {
  document.documentElement.setAttribute('theme', newValue)
}, { immediate: true })
</script>

<template>
  <router-view />
</template>

<style scoped>
</style>
