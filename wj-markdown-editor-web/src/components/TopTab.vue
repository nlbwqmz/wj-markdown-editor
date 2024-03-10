<template>
  <div class="container wj-scrollbar-hover">
    <div class="tab-item" v-for="(item) in fileStateList" :key="item.id">
      <div class="tab-name horizontal-vertical-center" @click="go(item.id)" :class="id === item.id ? 'active': ''">
        <span class="text-ellipsis">{{ item.fileName }}</span>
        <span v-show="item.saved === false" style="color: red">*</span>
      </div>
      <div class="tab-close horizontal-vertical-center" @click="handleTabClose(item)">
        <img :src="close" alt="">
      </div>
    </div>
  </div>
  <a-modal v-model:open="open" title="提示">
    <template #footer>
      <a-button style="margin-left: 10px" @click="open = false">取消</a-button>
      <a-button style="margin-left: 10px" type="primary" danger @click="closeFile">直接关闭</a-button>
      <a-button style="margin-left: 10px" type="primary" @click="closeFileAndSave">保存并关闭</a-button>
    </template>
    <p>{{ closeFileName }}未保存，是否确认关闭？</p>
  </a-modal>
</template>

<script setup>
import close from '@/assets/icon/close.png'
import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import nodeRequestUtil from '@/util/nodeRequestUtil'
const store = useStore()
const router = useRouter()
const fileStateList = computed(() => store.state.fileStateList)
const id = computed(() => store.state.id)
const open = ref(false)
const closeFileName = ref()
const closeId = ref()
const handleTabClose = item => {
  console.log('关闭Tab', item.id)
  closeFileName.value = item.fileName
  closeId.value = item.id
  if (item.saved === true) {
    closeFile().then(() => {})
  } else {
    open.value = true
  }
}

const closeFile = async () => {
  open.value = false
  const success = await nodeRequestUtil.closeFile(closeId.value)
  console.log(closeId.value, success, closeId.value === id.value)
  if (success && closeId.value === id.value) {
    const fileState = store.state.fileStateList[0]
    const routeState = store.state.routeState.find(item => item.id === fileState.id)
    router.push({ path: routeState.path, query: { id: routeState.id } })
  }
}

const closeFileAndSave = async () => {
  open.value = false
  const success = await nodeRequestUtil.closeFileAndSave(closeId.value)
  if (success && closeId.value === id.value) {
    const fileState = store.state.fileStateList[0]
    const routeState = store.state.routeState.find(item => item.id === fileState.id)
    router.push({ path: routeState.path, query: { id: routeState.id } })
  }
}
const go = clickedId => {
  if (id.value !== clickedId) {
    const routeState = store.state.routeState.find(item => item.id === clickedId)
    router.push({ path: routeState.path, query: { id: routeState.id } })
  }
}
</script>

<style scoped lang="less">
.container {
  user-select: none;
  border-top: 1px rgba(0, 0, 0, 0.1) solid;
  border-bottom: 1px rgba(0, 0, 0, 0.1) solid;
  padding: 0 5px 0 5px;
  width: 100%;
  overflow-y: hidden;
  overflow-x: auto;
  height: 30px;
  display: flex;
  justify-content: left;
  gap: 10px;
  .tab-item {
    padding: 5px 0 5px 0;
    //border: 1px red solid;
    border-radius: 5px;
    display: flex;
    height: 100%;
    .tab-name {
      height: 100%;
      flex: 1;
      padding: 5px;
      cursor: pointer;
    }
    .active {
      color: #4096ff;
    }
    .tab-name:hover {
      color: #4096ff;
    }
    .tab-close {
      height: 100%;
      width: 20px;
      border-radius: 20px;
      cursor: pointer;
      img {
        width: 10px;
      }
    }
    .tab-close:hover {
      background-color: rgb(237,237,237);
    }
  }
}
</style>
