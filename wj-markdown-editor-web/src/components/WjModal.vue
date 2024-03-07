<template>
  <div style="display: flex; flex-direction: column; height: 100vh">
    <div class="title-content">
      <div class="left electron-drag">
        <div style="display: flex; justify-content: left">
          <div class="horizontal-vertical-center">
            <slot name="icon"></slot>
          </div>
          <div class="horizontal-vertical-center">
            <span style="font-size: 12px; padding-left: 5px">
              <slot name="title"></slot>
            </span>
          </div>
        </div>
        <div class="space"></div>
      </div>
      <div class="right forbid-select-drag">
        <div class="img-div horizontal-vertical-center" @click="props.action.find(item => item.key === 'minimize').click" v-if="props.action.findIndex(item => item.key === 'minimize') > -1"><img :src="minimize" alt="minimize" class="forbid-select-drag"></div>
        <div class="img-div horizontal-vertical-center close-img-div" @click="props.action.find(item => item.key === 'close').click" v-if="props.action.findIndex(item => item.key === 'close') > -1"><img :src="close" alt="close" class="forbid-select-drag"></div>
      </div>
    </div>
    <div class="container wj-scrollbar-small" id="wj-modal-container">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
import minimize from '@/assets/icon/minimize.png'
import close from '@/assets/icon/close.png'

const props = defineProps({
  action: {
    type: Array,
    default: () => []
  }
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
    .space {
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
.container {
  padding: 10px;
  flex: 1;
  overflow: auto;
}
</style>
