<script setup>
import { ref } from 'vue'

defineProps({
  row: {
    type: Number,
    default: () => 6,
  },
  col: {
    type: Number,
    default: () => 6,
  },
})
const emits = defineEmits(['select'])
const currentRowIndex = ref(undefined)
const currentColIndex = ref(undefined)
function hasBackground(rowIndex, colIndex) {
  if (currentRowIndex.value === undefined || currentColIndex.value === undefined) {
    return false
  }
  return rowIndex <= currentRowIndex.value && colIndex <= currentColIndex.value
}
function onMouseover(rowIndex, colIndex) {
  currentRowIndex.value = rowIndex
  currentColIndex.value = colIndex
}
function onMouseout() {
  currentRowIndex.value = undefined
  currentColIndex.value = undefined
}
function onClick(rowIndex, colIndex) {
  emits('select', rowIndex, colIndex)
}
</script>

<template>
  <div class="flex flex-col">
    <div v-for="rowIndex in row" :key="rowIndex" class="flex">
      <div
        v-for="colIndex in col" :key="colIndex" class="cursor-pointer p-0.5"
        @mouseover="onMouseover(rowIndex, colIndex)"
        @mouseout="onMouseout"
        @click="onClick(rowIndex, colIndex)"
      >
        <div class="h-4 w-4 border-1 b-gray rounded-1 b-solid" :class="{ 'bg-gray': hasBackground(rowIndex, colIndex) }" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">

</style>
