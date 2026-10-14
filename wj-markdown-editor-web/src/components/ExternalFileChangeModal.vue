<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import {
  DOCUMENT_EXTERNAL_APPLY_COMMAND,
  DOCUMENT_EXTERNAL_IGNORE_COMMAND,
} from '@/util/document-session/documentSessionEventUtil.js'

const { t } = useI18n()
const store = useCommonStore()

const externalFileChange = computed(() => store.externalFileChange)
const diffTheme = computed(() => (store.config.theme.global === 'dark' ? 'dark' : 'light'))

// diff2html 体积较大且仅在外部变更对比时使用，
// 改为弹窗首次展示时动态加载，避免进入启动路径。
const diffLibs = ref(null)
watch(() => externalFileChange.value.visible, async (visible) => {
  if (!visible || diffLibs.value) {
    return
  }
  try {
    const [diffModule, diff2htmlModule] = await Promise.all([
      import('diff'),
      import('diff2html'),
      import('diff2html/bundles/css/diff2html.min.css'),
    ])
    diffLibs.value = {
      createPatch: diffModule.createPatch,
      diff2html: diff2htmlModule.html,
    }
  } catch (error) {
    console.error('[ExternalFileChangeModal] diff2html 动态加载失败:', error)
  }
}, { immediate: true })

const diffHtml = computed(() => {
  if (!diffLibs.value) {
    return ''
  }
  const { createPatch, diff2html } = diffLibs.value
  const fileName = externalFileChange.value.fileName || 'Unnamed'
  const diffString = createPatch(
    fileName,
    externalFileChange.value.localContent || '',
    externalFileChange.value.externalContent || '',
    '',
    '',
    { context: 5 },
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
    const result = await channelUtil.send({
      event: DOCUMENT_EXTERNAL_IGNORE_COMMAND,
      data: { version },
    })
    const shouldResetLoading = result === false
      || result?.ok === false
      || result?.snapshot?.externalPrompt?.version === version

    if (shouldResetLoading && store.externalFileChange.version === version) {
      store.setExternalFileChangeLoading(false)
    }
  } catch {
    if (store.externalFileChange.version === version) {
      store.setExternalFileChangeLoading(false)
    }
  }
}

async function applyExternalChange() {
  // 应用动作由 Electron 主导完成：
  // Electron 会直接更新会话内容与保存状态，
  // renderer 只通过最新 snapshot 收敛 UI。
  if (externalFileChange.value.loading) {
    return
  }
  const version = externalFileChange.value.version
  store.setExternalFileChangeLoading(true)
  try {
    const result = await channelUtil.send({
      event: DOCUMENT_EXTERNAL_APPLY_COMMAND,
      data: { version },
    })
    const shouldResetLoading = result === false
      || result?.ok === false
      || result?.snapshot?.externalPrompt?.version === version

    if (shouldResetLoading && store.externalFileChange.version === version) {
      store.setExternalFileChangeLoading(false)
    }
  } catch {
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
    width="80vw"
    :footer="null"
    centered
    :title="t('externalFileChangeModal.title')"
  >
    <div class="mb-4">
      <div class="text-3.5 color-[var(--wj-markdown-text-secondary)]">
        {{ t('externalFileChangeModal.description', { fileName: externalFileChange.fileName || 'Unnamed' }) }}
      </div>
    </div>
    <div class="wj-scrollbar relative max-h-60vh overflow-auto" v-html="diffHtml" />
    <div class="text-3.5">
      <div class="color-[var(--wj-markdown-text-primary)]">
        <span class="font-600">{{ t('externalFileChangeModal.ignore') }}：</span>
        <span class="color-[var(--wj-markdown-text-secondary)]">{{ t('externalFileChangeModal.ignoreActionDescription') }}</span>
      </div>
      <div class="color-[var(--wj-markdown-text-primary)]">
        <span class="font-600">{{ t('externalFileChangeModal.apply') }}：</span>
        <span class="color-[var(--wj-markdown-text-secondary)]">{{ t('externalFileChangeModal.applyActionDescription') }}</span>
      </div>
    </div>
    <div class="mt-4 flex justify-end gap-2">
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
  .d2h-file-side-diff {
    overflow-x: auto;
  }
}
</style>
