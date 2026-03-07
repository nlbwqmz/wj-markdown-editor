<script setup>
import { CodeDiff } from 'v-code-diff'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'

const { t } = useI18n()
const store = useCommonStore()

const externalFileChange = computed(() => store.externalFileChange)
const diffTheme = computed(() => (store.config.theme.global === 'dark' ? 'dark' : 'light'))

async function ignoreExternalChange() {
  // 忽略时不更新编辑器内容，
  // 只通知 Electron 清理当前这次待处理外部变更。
  if (externalFileChange.value.loading) {
    return
  }
  const version = externalFileChange.value.version
  store.setExternalFileChangeLoading(true)
  try {
    const success = await channelUtil.send({
      event: 'file-external-change-ignore',
      data: { version },
    })
    if (success && store.externalFileChange.version === version) {
      store.resetExternalFileChange()
    }
  } finally {
    if (store.externalFileChange.version === version) {
      store.setExternalFileChangeLoading(false)
    }
  }
}

async function applyExternalChange() {
  // 应用动作由 Electron 主导完成：
  // Electron 会直接更新 tempContent / 保存状态，
  // 然后再通过 `file-content-reloaded` 通知渲染端刷新。
  if (externalFileChange.value.loading) {
    return
  }
  const version = externalFileChange.value.version
  store.setExternalFileChangeLoading(true)
  try {
    const success = await channelUtil.send({
      event: 'file-external-change-apply',
      data: { version },
    })
    if (success && store.externalFileChange.version === version) {
      store.resetExternalFileChange()
    }
  } finally {
    if (store.externalFileChange.version === version) {
      store.setExternalFileChangeLoading(false)
    }
  }
}
</script>

<template>
  <a-modal
    wrap-class-name="external-file-change-modal"
    :open="externalFileChange.visible"
    :mask-closable="false"
    :keyboard="false"
    :closable="false"
    :width="1200"
    :footer="null"
    centered
  >
    <div class="external-file-change-modal__header mb-4">
      <div class="external-file-change-modal__title text-18px font-600">
        {{ t('externalFileChangeModal.title') }}
      </div>
      <div class="external-file-change-modal__description mt-2 text-14px">
        {{ t('externalFileChangeModal.description', { fileName: externalFileChange.fileName || 'Unnamed' }) }}
      </div>
    </div>
    <CodeDiff
      diff-style="char"
      :old-string="externalFileChange.localContent"
      :new-string="externalFileChange.externalContent"
      output-format="side-by-side"
      language="plaintext"
      :theme="diffTheme"
      :filename="`${externalFileChange.fileName || 'Unnamed'} - ${t('externalFileChangeModal.localVersion')}`"
      :new-filename="`${externalFileChange.fileName || 'Unnamed'} - ${t('externalFileChangeModal.externalVersion')}`"
      max-height="60vh"
      class="wj-scrollbar"
    />
    <div class="mt-4 flex justify-end gap-3">
      <a-button :loading="externalFileChange.loading" @click="ignoreExternalChange">
        {{ t('externalFileChangeModal.ignore') }}
      </a-button>
      <a-button type="primary" :loading="externalFileChange.loading" @click="applyExternalChange">
        {{ t('externalFileChangeModal.apply') }}
      </a-button>
    </div>
  </a-modal>
</template>

<style lang="scss">
.external-file-change-modal {
  .ant-modal-content {
    color: var(--wj-markdown-text-primary);
  }

  .external-file-change-modal__header {
    color: var(--wj-markdown-text-primary);
  }

  .external-file-change-modal__title {
    color: var(--wj-markdown-text-primary);
  }

  .external-file-change-modal__description {
    color: var(--wj-markdown-text-secondary);
  }
}
</style>
