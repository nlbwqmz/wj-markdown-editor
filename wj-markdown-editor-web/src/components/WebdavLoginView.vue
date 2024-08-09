<template>
  <div
    style="width: 100%; height: 100%"
    class="horizontal-vertical-center"
  >
    <div>
      <div style="font-weight: bold; text-align: center; padding-bottom: 20px; font-size: 20px">
        webdav
      </div>
      <a-form
        :model="formState"
        name="webdavLogin"
      >
        <a-form-item
          label="链接"
          name="url"
          :rules="[{ required: true, message: '请输入链接' }, { pattern: /^http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w- .\/?%&=]*)?/, message: '请输入正确的链接' }]"
        >
          <a-input
            v-model:value="formState.url"
            spellcheck="false"
          >
            <template #prefix>
              <LinkOutlined />
            </template>
          </a-input>
        </a-form-item>
        <a-form-item
          label="用户"
          name="username"
          :rules="[{ required: true, message: '请输入用户名' }]"
        >
          <a-input
            v-model:value="formState.username"
            spellcheck="false"
          >
            <template #prefix>
              <UserOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item
          label="密码"
          name="password"
          :rules="[{ required: true, message: '请输入密码' }]"
        >
          <a-input-password v-model:value="formState.password">
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
        </a-form-item>
        <a-form-item name="autoLogin">
          <div style="display: flex; justify-content: center">
            <a-checkbox v-model:checked="formState.autoLogin">
              自动登录
            </a-checkbox>
          </div>
        </a-form-item>
        <a-form-item class="horizontal-vertical-center">
          <a-button
            :disabled="disabled"
            type="primary"
            @click="login"
            :loading="loading"
          >
            登录
          </a-button>
        </a-form-item>
      </a-form>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { LockOutlined, UserOutlined, LinkOutlined } from '@ant-design/icons-vue'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import commonUtil from '@/util/commonUtil'

const formState = reactive({
  username: '',
  password: '',
  url: '',
  autoLogin: false
})

const loading = ref(false)
const disabled = computed(() => {
  return !(formState.username && formState.password && formState.url && /^http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w- .\\/?%&=]*)?/.test(formState.url))
})

const login = async () => {
  loading.value = true
  await nodeRequestUtil.loginWebdav(commonUtil.deepCopy(formState))
  loading.value = false
}
</script>

<style scoped lang="less">

</style>
