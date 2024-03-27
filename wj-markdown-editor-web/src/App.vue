<template>
  <div style="display: flex; flex-direction: column;width: 100%; height: 100vh;">
    <div v-show="showTop">
      <top-title/>
      <top-menu/>
    </div>
    <div style="flex: 1; display: flex; width: 100%; overflow: hidden">
      <div style="width: 300px; border-top: 1px rgba(0, 0, 0, 0.1) solid" v-if="showTop" v-show="showWebdav">
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
</template>

<style lang="less">
* {
  margin: 0;
  padding: 0;
}
</style>
<script setup>
import TopMenu from '@/components/TopMenu.vue'
import { computed, onBeforeMount, ref, watch } from 'vue'
import router from '@/router'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import store from '@/store'
import TopTitle from '@/components/TopTitle.vue'
import TopTab from '@/components/TopTab.vue'
import WebdavLoginView from '@/components/WebdavLoginView.vue'
import WebdavFileView from '@/components/WebdavFileView.vue'
const showTop = ref(false)

watch(() => router.currentRoute.value, (newValue, olValue) => {
  showTop.value = newValue && newValue.meta && newValue.meta.showTop === true
}, { immediate: true })
onBeforeMount(async () => {
  const config = await nodeRequestUtil.getConfig()
  store.commit('updateConfig', config)
  store.commit('setShowWebdav', config.showWebdav)
})
const showWebdav = computed(() => store.state.showWebdav)
const webdavLogin = computed(() => store.state.webdavLogin)
</script>
