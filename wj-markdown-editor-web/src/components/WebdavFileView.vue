<template>
  <div class="header">
    <div class="horizontal-vertical-center back" @click="handleBack" :style="currentPath === '/' ? 'cursor: not-allowed;' : ''"><ArrowLeftOutlined /></div>
    <div class="text-ellipsis" style="flex: 1; line-height: 25px; text-align: center">{{title}}</div>
    <div class="horizontal-vertical-center"><a-button type="link" size="small" @click="refresh">刷新</a-button></div>
    <div class="horizontal-vertical-center"><a-button type="link" size="small" @click="logout">退出</a-button></div>
  </div>
  <div class="container wj-scrollbar-small">
    <a-spin :spinning="spinning">
      <div class="file" v-for="(item, index) in fileList" :key="index" @click="handleFileClick(item)">
        <div class="horizontal-vertical-center">
          <img :src="folderImg" v-if="item.type === 'directory'" alt="" class="icon">
          <img :src="markdownImg" v-else-if="isMdFile(item.basename)" alt="" class="icon">
          <img :src="fileImg" v-else alt="" class="icon">
        </div>
        <div :title="item.basename" class="text-ellipsis" style="flex: 1; line-height: 25px" :style="fileStateList.some(fileState => fileState.type === 'webdav' && fileState.originFilePath === item.filename) ? 'color: #4096ff;' : ''">
          {{item.basename}}
        </div>
      </div>
    </a-spin>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import folderImg from '@/assets/icon/folder.png'
import fileImg from '@/assets/icon/file.png'
import markdownImg from '@/assets/logo.png'
import { message } from 'ant-design-vue'
import store from '@/store'
const fileList = ref([])
const currentPath = ref('/')
const title = ref('/')
const spinning = ref(false)

const refresh = async () => {
  spinning.value = true
  fileList.value = await nodeRequestUtil.webdavGetDirectoryContents(currentPath.value)
  spinning.value = false
}
const handleBack = async () => {
  if (currentPath.value !== '/') {
    const split = currentPath.value.split('/')
    split.splice(split.length - 1, 1)
    currentPath.value = split.join('/') || '/'
  }
}
const handleFileClick = async file => {
  if (file.type === 'directory') {
    currentPath.value = file.filename
  } else if (isMdFile(file.filename)) {
    nodeRequestUtil.openWebdavMd(file.filename, file.basename)
  } else {
    message.warn('暂不支持该文件类型')
  }
}

watch(currentPath, async (newValue, oldValue) => {
  const split = newValue.split('/')
  title.value = split[split.length - 1] || '/'
  store.commit('currentWebdavPath', currentPath)
  await refresh()
}, { immediate: true })

const isMdFile = filename => {
  return filename && filename.length > 3 && filename.substring(filename.length - 3) === '.md'
}

const logout = () => {
  nodeRequestUtil.webdavLogout()
}

const fileStateList = computed(() => store.state.fileStateList)
watch(() => store.state.openWebdavPath, (newValue, oldValue) => {
  if (newValue) {
    const split = newValue.split('/')
    split.splice(split.length - 1, 1)
    const newPath = split.join('/') || '/'
    if (currentPath.value === newPath) {
      refresh()
    } else {
      currentPath.value = newPath
    }
    store.commit('openWebdavPath', '')
  }
})
</script>

<style scoped lang="less">
.header {
  height: 35px;
  width: 100%;
  padding: 5px 5px 5px 0;
  display: flex;
  gap: 10px;
  .back {
    padding: 5px;
    cursor: pointer;
  }
  .back:hover {
    background-color: rgb(220, 220, 220);
  }
}
.container {
  height: 100%;
  overflow: auto;
  padding: 5px 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  .file {
    padding: 5px;
    display: flex;
    gap: 10px;
    cursor: pointer;
    .icon {
      width: 20px;
      height: 20px;
    }
  }
  .file:hover {
    background-color: rgb(237,237,237);
  }
}
:deep(.ant-btn.ant-btn-sm) {
  padding: 0;
}
</style>
