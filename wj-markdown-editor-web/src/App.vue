<template>
  <div style="display: flex; flex-direction: column;width: 100%; height: 100%;">
    <div v-show="showTop">
      <top-title/>
      <top-menu/>
    </div>
    <div style="flex: 1; display: flex; width: 100%; overflow: hidden">
      <div style="width: 300px; border-top: var(--wj-inner-border)" v-if="showTop" v-show="showWebdav">
        <webdav-login-view v-if="!webdavLogin"/>
        <webdav-file-view v-if="webdavLogin"/>
      </div>
      <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden">
        <top-tab v-if="showTop"/>
        <div style="flex: 1; overflow: auto" id="main" class="wj-scrollbar">
          <router-view v-slot="{ Component }">
            <keep-alive :max="100">
              <component :is="Component" :key="$route.fullPath"/>
            </keep-alive>
          </router-view>
        </div>
      </div>
    </div>
  </div>
  <SearchBarWeb v-model="showSearchBar"/>
</template>

<style lang="less">
* {
  margin: 0;
  padding: 0;
}
#app {
  width: 100%;
  height: 100%;
  border: 1px rgba(0, 0, 0, 0.3) solid;
}
body {
  width: 100%;
  height: 100%;
}
</style>
<script setup>
import TopMenu from '@/components/TopMenu.vue'
import { computed, onBeforeMount, onMounted, onUnmounted, ref, watch } from 'vue'
import router from '@/router'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import store from '@/store'
import TopTitle from '@/components/TopTitle.vue'
import TopTab from '@/components/TopTab.vue'
import WebdavLoginView from '@/components/WebdavLoginView.vue'
import WebdavFileView from '@/components/WebdavFileView.vue'
import SearchBarWeb from '@/views/SearchBarWeb.vue'
const showTop = ref(false)
const showSearchBar = ref(false)

watch(() => router.currentRoute.value, (newValue, olValue) => {
  showTop.value = newValue && newValue.meta && newValue.meta.showTop === true
}, { immediate: true })
onBeforeMount(async () => {
  nodeRequestUtil.checkAutoLogin()
  const config = await nodeRequestUtil.getConfig()
  store.commit('updateConfig', config)
  store.commit('setShowWebdav', config.showWebdav)
  const fileStateList = await nodeRequestUtil.getFileStateList()
  store.commit('updateFileStateList', fileStateList)
})
const showWebdav = computed(() => store.state.showWebdav)
const webdavLogin = computed(() => store.state.webdavLogin)

const handleKeyDown = event => {
  if (router.currentRoute.value.path === '/preview') {
    if (event.ctrlKey && event.key === 'f') {
      showSearchBar.value = true
    } else if (event.keyCode === 27) {
      showSearchBar.value = false
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

</script>
