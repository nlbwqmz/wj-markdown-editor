<template>
  <div style="display: flex; border: var(--wj-inner-border)">
    <div class="horizontal-vertical-center" style="padding-left: 10px">
      <MenuUnfoldOutlined style="cursor: pointer" v-show="!showWebdav" @click="switchShowWebdav"/>
      <MenuFoldOutlined style="cursor: pointer" v-show="showWebdav" @click="switchShowWebdav"/>
    </div>
    <div style="flex: 1; overflow: auto">
      <div class="container wj-hide-scrollbar" @mousewheel="handleScroll($event)" ref="tabContainerRef">
        <div class="tab-item" v-for="(item) in fileStateList" :key="item.id">
          <a-dropdown :trigger="['contextmenu']">
            <div class="tab-name horizontal-vertical-center" @click="go(item.id)" :class="id === item.id ? 'active': ''">
              <img :src="cloudImg" alt="" style="width: 16px; height: 16px; margin-right: 5px" v-if="item.type === 'webdav'">
              <img :src="localImg" alt="" style="width: 12px; height: 12px; margin-right: 5px" v-else-if="item.type === 'local'">
              <img :src="unknownImg" alt="" style="width: 12px; height: 12px; margin-right: 5px" v-else>
              <span class="text-ellipsis">{{ item.fileName }}</span>
              <span v-show="item.saved === false" style="color: #ff4d4f">*</span>
            </div>
            <template #overlay>
              <a-menu>
                <a-menu-item :key="item.id" :disabled="!item.originFilePath" @click="openFolder(item)">打开所在文件夹</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <div class="tab-close horizontal-vertical-center" @click="handleTabClose(item)">
            <img :src="close" alt="">
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import close from '@/assets/icon/close.png'
import localImg from '@/assets/icon/local.png'
import cloudImg from '@/assets/icon/cloud.png'
import unknownImg from '@/assets/icon/unknown.png'
import { computed, createVNode, h, ref } from 'vue'
import { useStore } from 'vuex'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import { Modal, Button } from 'ant-design-vue'
import { ExclamationCircleOutlined, MenuUnfoldOutlined, MenuFoldOutlined } from '@ant-design/icons-vue'
import commonUtil from '@/util/commonUtil'
const store = useStore()
const fileStateList = computed(() => store.state.fileStateList)
const id = computed(() => store.state.id)
const tabContainerRef = ref()

const showWebdav = computed(() => store.state.showWebdav)

const switchShowWebdav = () => {
  store.commit('switchShowWebdav')
}

const handleScroll = e => {
  tabContainerRef.value.scrollLeft = tabContainerRef.value.scrollLeft + e.deltaY
}
const handleTabClose = item => {
  if (item.saved === true) {
    closeFile(item.id)
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

const closeFile = (closeId) => {
  nodeRequestUtil.closeFile(closeId)
}

const closeFileAndSave = (closeId) => {
  nodeRequestUtil.saveFile({ id: closeId, close: true })
}
const go = clickedId => {
  if (id.value !== clickedId) {
    commonUtil.changeTab(clickedId)
  }
}

const openFolder = clicked => {
  if (clicked.type === 'local') {
    nodeRequestUtil.openFolder(clicked.id)
  } else if (clicked.type === 'webdav') {
    store.commit('openWebdavPath', clicked.originFilePath)
  }
}
</script>

<style scoped lang="less">
.container {
  user-select: none;
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
