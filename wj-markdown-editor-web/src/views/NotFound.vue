<template>
  <div
    style="width: 100%; height: 100%; border-left: var(--wj-inner-border)"
    class="horizontal-vertical-center"
  >
    <a-empty :image="simpleImage">
      <template #description>
        <p style="color: red">
          未找到当前文件
        </p>
      </template>
    </a-empty>
  </div>
</template>

<script setup>
import { Empty } from 'ant-design-vue'
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE
</script>

<style scoped lang="less">

</style>
