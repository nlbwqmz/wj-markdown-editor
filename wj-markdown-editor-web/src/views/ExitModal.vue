<template>
  <div style="height: 100vh; display: flex; flex-direction: column; justify-content: space-between; border-radius: 10px">
    <div style="display: flex; padding: 20px">
      <div class="drag">
        <ExclamationCircleTwoTone two-tone-color="#faad14" style="font-size: 24px"/>
      </div>
      <div style="flex: 1; padding-left: 20px">
        <div style="height: 24px; line-height: 24px;font-size: 20px; font-weight: bold; " class="drag">提示</div>
        <div style="font-size: 16px; margin-top: 20px">数据未保存，是否确认退出？</div>
      </div>
    </div>
    <div style="width: 100%; text-align: right; padding: 20px">
      <a-button style="margin-left: 10px" @click="nodeRequestUtil.closeExitModal">取消</a-button>
      <a-button style="margin-left: 10px" type="primary" danger @click="nodeRequestUtil.exit">不保存直接退出</a-button>
      <a-button style="margin-left: 10px" type="primary" @click="() => nodeRequestUtil.save(true)">保存并退出</a-button>
    </div>
  </div>
</template>

<script setup>
import nodeRequestUtil from '@/util/nodeRequestUtil'
import { ExclamationCircleTwoTone } from '@ant-design/icons-vue'
</script>

<style scoped lang="less">
.drag {
  -webkit-app-region: drag;
  -webkit-user-select: none;
}
</style>
