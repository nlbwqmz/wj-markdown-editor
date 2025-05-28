<script setup>
import { useCommonStore } from '@/stores/counter.js'
import { px2remTransformer } from 'ant-design-vue'

import { watch } from 'vue'

// 设置ant-design-vue 的 rem 配置
const px2rem = px2remTransformer({
  rootValue: 16,
})

watch(() => useCommonStore().config.theme.global, (newValue) => {
  document.documentElement.setAttribute('theme', newValue)
}, { immediate: true })

watch(() => useCommonStore().config.fontSize, (newValue) => {
  document.documentElement.style.fontSize = `${newValue}px`
}, { immediate: true })
</script>

<template>
  <a-style-provider :transformers="[px2rem]">
    <router-view />
  </a-style-provider>
</template>

<style scoped>
</style>
