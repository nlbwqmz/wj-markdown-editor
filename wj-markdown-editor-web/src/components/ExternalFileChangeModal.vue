<script setup>
import { createTwoFilesPatch } from 'diff'
import { html as diff2html } from 'diff2html'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import 'diff2html/bundles/css/diff2html.min.css'

const { t } = useI18n()
const store = useCommonStore()

const externalFileChange = computed(() => store.externalFileChange)
const diffTheme = computed(() => (store.config.theme.global === 'dark' ? 'dark' : 'light'))
const diffHtml = computed(() => {
  const fileName = externalFileChange.value.fileName || 'Unnamed'
  const localVersionName = `${fileName} - ${t('externalFileChangeModal.localVersion')}`
  const externalVersionName = `${fileName} - ${t('externalFileChangeModal.externalVersion')}`
  const diffString = createTwoFilesPatch(
    localVersionName,
    externalVersionName,
    externalFileChange.value.localContent || '',
    externalFileChange.value.externalContent || '',
    '',
    '',
    { context: 3 },
  )
  return diff2html(diffString, {
    colorScheme: diffTheme.value,
    diffStyle: 'char',
    drawFileList: false,
    matching: 'words',
    outputFormat: 'side-by-side',
    renderNothingWhenEmpty: true,
  })
})

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
    <div class="external-file-change-modal__diff wj-scrollbar relative" v-html="diffHtml" />
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

  .external-file-change-modal__diff {
    max-height: 60vh;
    overflow: auto;
  }

  .d2h-file-side-diff {
    overflow-x: auto;
  }
}
</style>
