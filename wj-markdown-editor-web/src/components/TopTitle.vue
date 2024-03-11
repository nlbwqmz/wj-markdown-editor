<template>
  <div class="title-content">
    <div class="left electron-drag">
      <div style="display: flex; justify-content: left">
        <div class="horizontal-vertical-center">
          <img :src="logo" alt="logo"/>
        </div>
        <div class="horizontal-vertical-center">
          <span style="font-size: 12px; padding-left: 5px">wj-markdown-editor</span>
        </div>
      </div>
      <div class="content horizontal-vertical-center">
<!--        <span class="text-ellipsis" style="direction: rtl">{{content}}</span>-->
<!--        <span v-show="!saved" style="color: red">*</span>-->
      </div>
    </div>
    <div class="right forbid-select-drag">
      <div class="img-div horizontal-vertical-center" @click="action('minimize')"><img :src="minimize" alt="minimize" class="forbid-select-drag"></div>
      <div class="img-div horizontal-vertical-center" @click="action('unmaximize')" v-show="!showMaximizeAction"><img :src="unmaximize" alt="unmaximize" class="forbid-select-drag"></div>
      <div class="img-div horizontal-vertical-center" @click="action('maximize')" v-show="showMaximizeAction"><img :src="maximize" alt="maximize" class="forbid-select-drag"></div>
      <div class="img-div horizontal-vertical-center close-img-div" @click="action('close')"><img :src="close" alt="close" class="forbid-select-drag"></div>
    </div>
  </div>
</template>

<script setup>
import logo from '@/assets/logo.png'
import minimize from '@/assets/icon/minimize.png'
import close from '@/assets/icon/close.png'
import maximize from '@/assets/icon/maximize.png'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import nodeRegisterUtil from '@/util/nodeRegisterUtil'
import { createVNode, h, ref } from 'vue'
import unmaximize from '@/assets/icon/unmaximize.png'
import store from '@/store'
import { Button, Modal } from 'ant-design-vue'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'

const showMaximizeAction = ref(true)
const action = type => {
  if (type !== 'close') {
    nodeRequestUtil.action(type)
  } else {
    if (store.state.fileStateList.some(item => item.saved === false)) {
      const modal = Modal.confirm({
        centered: true,
        title: '提示',
        icon: createVNode(ExclamationCircleOutlined),
        content: '有文件未保存，是否确认退出程序？',
        footer: h('div', { style: { width: '100%', display: 'flex', justifyContent: 'right', gap: '10px', paddingTop: '10px' } }, [
          h(Button, { onClick: () => modal.destroy() }, () => '取消'),
          h(Button, { type: 'primary', danger: true, onClick: () => { nodeRequestUtil.action('close'); modal.destroy() } }, () => '直接关闭')
        ])
      })
    } else {
      nodeRequestUtil.action('close')
    }
  }
}

nodeRegisterUtil.showMaximizeAction(bool => {
  showMaximizeAction.value = bool
})
</script>

<style scoped lang="less">
.title-content {
  padding-left: 10px;
  display: flex;
  justify-content: space-between;
  img {
    width: 16px;
    height: 16px;
  }
  .left {
    flex: 1;
    display: flex;
    justify-content: left;
    .logo{
    }
    .content {
      flex: 1;
      width: 0;
      font-size: 12px;
      padding: 0 10px
    }
  }
  .right {
    display: flex;
    justify-content: left;
    .img-div {
      padding: 10px;
    }
    .img-div:hover {
      background-color: rgb(237,237,237);
    }
    .close-img-div:hover {
      background-color: red;
    }
  }
}
</style>
