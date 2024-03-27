<template>
  <a-modal :closable="false" title="保存到" :open="true" centered>
    <a-input v-model:value="value" placeholder="webdav文件名" suffix=".md"></a-input>
    <template #footer>
      <a-button @click="handleClose">取消</a-button>
      <a-button @click="handleLocal" type="primary">本地</a-button>
      <a-button @click="handleWebdav" type="primary" :disabled="disabled">webdav</a-button>
    </template>
  </a-modal>
</template>

<script setup>
import { computed, ref } from 'vue'
import nodeRequestUtil from '@/util/nodeRequestUtil'
const props = defineProps(['path'])
const emit = defineEmits(['close'])

const value = ref()
const handleClose = () => {
  emit('close')
}
const handleLocal = () => {
  nodeRequestUtil.saveFile('local')
  emit('close')
}
const handleWebdav = () => {
  nodeRequestUtil.saveFile('webdav', props.path + '/' + value.value + '.md')
  emit('close')
}

const disabled = computed(() => !value.value || /^\.|[\\/:*?"<>|]/img.test(value.value))

</script>

<style scoped lang="less">

</style>
