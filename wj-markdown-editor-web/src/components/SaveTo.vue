<template>
  <a-modal :closable="true" :title="!webdavSelected ? '请选择保存方式' : '请输入webdav文件名'" v-model:open="open" centered @afterClose="handleClose" :footer="null">
    <div style="padding: 10px 0">
      <div style="display: flex; justify-content: space-around" v-show="!webdavSelected">
        <a-button @click="handleLocal" type="primary">本地</a-button>
        <a-button @click="() => webdavSelected = true" type="primary">webdav</a-button>
      </div>
      <div v-show="webdavSelected">
        <div style="display: flex; flex-direction: column; gap: 10px">
          <a-input v-model:value="value" placeholder="请输入webdav文件名" suffix=".md"></a-input>
          <div style="font-size: 14px;">文件将保存到当前打开的webdav目录。</div>
          <div style="display: flex; justify-content: space-around;">
            <a-button @click="() => webdavSelected = false">返回</a-button>
            <a-button @click="handleWebdav" type="primary" :disabled="disabled">保存</a-button>
          </div>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup>
import { computed, ref } from 'vue'
import nodeRequestUtil from '@/util/nodeRequestUtil'
const props = defineProps(['path', 'id', 'close'])
const emit = defineEmits(['close'])
const open = ref(true)
const value = ref()

const webdavSelected = ref(false)
const handleClose = () => {
  emit('close')
}
const handleLocal = () => {
  nodeRequestUtil.saveFile({ id: props.id, type: 'local', close: props.close })
  open.value = false
}
const handleWebdav = () => {
  nodeRequestUtil.saveFile({ id: props.id, type: 'webdav', close: props.close, currentWebdavPath: props.path + '/' + value.value + '.md' })
  open.value = false
}

const disabled = computed(() => !value.value || /^\.|[\\/:*?"<>|]/img.test(value.value))

</script>

<style scoped lang="less">

</style>
