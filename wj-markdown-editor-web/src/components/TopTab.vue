<template>
  <div class="container wj-hide-scrollbar" @mousewheel="handleScroll($event)" ref="tabContainerRef">
    <div class="tab-item" v-for="(item) in fileStateList" :key="item.id">
      <a-dropdown :trigger="['contextmenu']">
        <div class="tab-name horizontal-vertical-center" @click="go(item.id)" :class="id === item.id ? 'active': ''">
          <span class="text-ellipsis">{{ item.fileName }}</span>
          <span v-show="item.saved === false" style="color: red">*</span>
        </div>
        <template #overlay>
          <a-menu>
            <a-menu-item :key="item.id" :disabled="!item.originFilePath" @click="openFolder(item.id)">打开所有文件夹</a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
      <div class="tab-close horizontal-vertical-center" @click="handleTabClose(item)">
        <img :src="close" alt="">
      </div>
    </div>
  </div>
</template>

<script setup>
import close from '@/assets/icon/close.png'
import { computed, createVNode, h, ref } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import { Modal, Button } from 'ant-design-vue'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
const store = useStore()
const router = useRouter()
const fileStateList = computed(() => store.state.fileStateList)
const id = computed(() => store.state.id)
const tabContainerRef = ref()

const handleScroll = e => {
  tabContainerRef.value.scrollLeft = tabContainerRef.value.scrollLeft + e.deltaY
}
const handleTabClose = item => {
  if (item.saved === true) {
    closeFile(item.id).then(() => {})
  } else {
    const modal = Modal.confirm({
      centered: true,
      title: '提示',
      icon: createVNode(ExclamationCircleOutlined),
      content: '当前文件未保存，是否确认关闭？',
      footer: h('div', { style: { width: '100%', display: 'flex', justifyContent: 'right', gap: '10px', paddingTop: '10px' } }, [
        h(Button, { onClick: () => modal.destroy() }, () => '取消'),
        h(Button, { type: 'primary', danger: true, onClick: () => { closeFile(item.id); modal.destroy() } }, () => '直接关闭'),
        h(Button, { type: 'primary', onClick: () => { closeFileAndSave(item.id); modal.destroy() } }, () => '保存并关闭')
      ])
    })
  }
}

const closeFile = async (closeId) => {
  const success = await nodeRequestUtil.closeFile(closeId)
  if (success && closeId === id.value) {
    executeChangeTab()
  }
}

const executeChangeTab = () => {
  const fileState = store.state.fileStateList[0]
  const routeState = store.state.routeState.find(item => item.id === fileState.id)
  if (routeState) {
    router.push({ path: routeState.path, query: { id: routeState.id } }).then(() => {})
  } else {
    router.push({ path: '/edit', query: { id: fileState.id } }).then(() => {})
  }
}

const closeFileAndSave = async (closeId) => {
  const success = await nodeRequestUtil.closeFileAndSave(closeId)
  if (success && closeId === id.value) {
    executeChangeTab()
  }
}
const go = clickedId => {
  if (id.value !== clickedId) {
    const routeState = store.state.routeState.find(item => item.id === clickedId)
    router.push({ path: routeState.path, query: { id: routeState.id } })
  }
}

const openFolder = clickedId => {
  nodeRequestUtil.openFolder(clickedId)
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
  height: 35px;
  display: flex;
  justify-content: left;
  //gap: 5px;
  .tab-item {
    padding: 5px 5px 5px 0;
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
    //.tab-name:hover {
    //  color: #4096ff;
    //}
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
      background-color: rgb(220, 220, 220);
    }
  }
  .tab-item:hover {
    background-color: rgb(237,237,237);
  }
}
</style>
