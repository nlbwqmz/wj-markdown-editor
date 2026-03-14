<script setup>
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import dayjs from 'dayjs'
import { createVNode, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownEdit from '@/components/editor/MarkdownEdit.vue'
import PreviewAssetContextMenu from '@/components/editor/PreviewAssetContextMenu.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import eventEmit from '@/util/channel/eventEmit.js'
import commonUtil from '@/util/commonUtil.js'
import {
  createDocumentSessionBootstrapGuard,
  DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT,
} from '@/util/document-session/documentSessionEventUtil.js'
import { shouldSuppressNextContentSync } from '@/util/editor/contentUpdateMetaUtil.js'
import {
  getPreviewAssetDeleteReasonMessageKey,
  resolvePreviewAssetDeletePlan,
  shouldContinueMarkdownCleanup,
} from '@/util/editor/previewAssetDeleteDecisionUtil.js'
import {
  countRemainingAssetReferences,
  removeAllAssetReferencesFromMarkdown,
  removeAssetFromMarkdown,
} from '@/util/editor/previewAssetRemovalUtil.js'

const content = ref('')
// 确保content已获取再传入组件
const ready = ref(false)
const { t } = useI18n()
const store = useCommonStore()
const watermark = ref()
const config = ref()
const contentUpdateMeta = ref({
  token: 0,
  cursorPosition: null,
  focus: false,
  scrollIntoView: false,
})
const previewAssetMenu = ref({
  open: false,
  x: 0,
  y: 0,
  asset: null,
})
const multiReferenceDeleteModal = ref({
  open: false,
  asset: null,
  referenceCount: 0,
  deleteFileEnabled: false,
  reasonMessageKey: null,
  loading: false,
})
let contentUpdateToken = 0
let applyingSessionContent = false
let recentMissingPrompted = false
const documentSessionBootstrapGuard = createDocumentSessionBootstrapGuard()

function updateEditorContent(nextContent, options = {}) {
  contentUpdateToken += 1
  applyingSessionContent = shouldSuppressNextContentSync({
    currentContent: content.value,
    nextContent,
    skipContentSync: options.skipContentSync === true,
  })
  contentUpdateMeta.value = {
    token: contentUpdateToken,
    cursorPosition: Number.isInteger(options.cursorPosition) ? options.cursorPosition : null,
    focus: options.focus === true,
    scrollIntoView: options.scrollIntoView === true,
  }
  content.value = nextContent
}

function save() {
  channelUtil.send({ event: 'save' })
}

function applyDocumentSessionSnapshot(snapshot, options = {}) {
  if (!snapshot) {
    return
  }

  if (options.promptRecentMissing === true && snapshot.isRecentMissing === true && snapshot.recentMissingPath && recentMissingPrompted === false) {
    recentMissingPrompted = true
    commonUtil.recentFileNotExists(snapshot.recentMissingPath)
  } else if (snapshot.isRecentMissing !== true) {
    recentMissingPrompted = false
  }

  // 编辑器内容现在只从 document session snapshot 同步，
  // 避免再和旧的 file-content-reloaded / get-file-info 元信息混写。
  updateEditorContent(snapshot.content, {
    skipContentSync: true,
  })
  ready.value = true
}

function onDocumentSessionSnapshotChanged(snapshot) {
  documentSessionBootstrapGuard.markSnapshotApplied()
  applyDocumentSessionSnapshot(snapshot)
}

async function loadCurrentDocumentSessionSnapshot() {
  const requestContext = documentSessionBootstrapGuard.beginRequest()
  const snapshot = await channelUtil.send({ event: 'document.get-session-snapshot' })
  if (documentSessionBootstrapGuard.shouldApplyRequestResult(requestContext) !== true) {
    return
  }
  const normalizedSnapshot = store.applyDocumentSessionSnapshot(snapshot)
  window.document.title = normalizedSnapshot.windowTitle
  applyDocumentSessionSnapshot(normalizedSnapshot, {
    promptRecentMissing: true,
  })
}

onMounted(async () => {
  eventEmit.on(DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT, onDocumentSessionSnapshotChanged)
  // 页面初始化时主动拉一次当前 session snapshot，
  // 确保首屏和后续主进程推送走的是同一套结构。
  await loadCurrentDocumentSessionSnapshot()
})

onBeforeUnmount(() => {
  eventEmit.remove(DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT, onDocumentSessionSnapshotChanged)
})

watch(() => content.value, (newValue, oldValue) => {
  if (newValue !== oldValue) {
    if (applyingSessionContent) {
      // 由 snapshot 驱动的内容替换不应再次回写主进程，
      // 否则容易把“外部应用后的最终内容”误当成新的手工编辑。
      applyingSessionContent = false
      return
    }
    // 编辑器里每次真实内容变化，都会同步给 Electron 更新 tempContent。
    // 保存状态、外部变更收敛等逻辑都在 Electron 侧统一判断。
    channelUtil.send({ event: 'file-content-update', data: newValue })
  }
})

watch(() => store.config, (newValue) => {
  // 水印
  const tempWatermark = JSON.parse(JSON.stringify(newValue.watermark))
  tempWatermark.content = tempWatermark.content ? tempWatermark.content : 'wj-markdown-editor'
  if (tempWatermark.dateEnabled === true) {
    tempWatermark.content = [tempWatermark.content, dayjs(new Date()).format(tempWatermark.datePattern)]
  }
  tempWatermark.enabled = tempWatermark.enabled && tempWatermark.previewEnabled
  watermark.value = tempWatermark
  config.value = newValue
}, { deep: true, immediate: true })

function closePreviewAssetMenu() {
  previewAssetMenu.value.open = false
  previewAssetMenu.value.asset = null
}

function onAssetContextmenu(assetInfo) {
  previewAssetMenu.value = {
    open: true,
    x: assetInfo.clientX,
    y: assetInfo.clientY,
    asset: assetInfo,
  }
}

function openPreviewAssetInExplorer() {
  const assetInfo = previewAssetMenu.value.asset
  if (!assetInfo?.resourceUrl) {
    return
  }
  channelUtil.send({
    event: 'open-folder',
    data: {
      resourceUrl: assetInfo.resourceUrl,
      rawPath: assetInfo.rawPath,
    },
  })
}

function onAssetOpen(assetInfo) {
  if (!assetInfo?.resourceUrl) {
    return
  }
  channelUtil.send({
    event: 'open-folder',
    data: {
      resourceUrl: assetInfo.resourceUrl,
      rawPath: assetInfo.rawPath,
    },
  })
}

function resolveComparableAssetPath(rawPath) {
  if (!rawPath) {
    return null
  }
  return channelUtil.sendSync({ event: 'get-local-resource-comparable-key', data: rawPath }) || rawPath
}

function closeMultiReferenceDeleteModal() {
  if (multiReferenceDeleteModal.value.loading) {
    return
  }
  multiReferenceDeleteModal.value = {
    open: false,
    asset: null,
    referenceCount: 0,
    deleteFileEnabled: false,
    reasonMessageKey: null,
    loading: false,
  }
}

function getAssetReferenceCount(assetInfo) {
  return countRemainingAssetReferences(content.value, assetInfo, {
    resolveComparablePath: resolveComparableAssetPath,
  })
}

async function applyAssetDelete(nextContent, assetInfo, options = {}) {
  const updateMarkdownContent = () => {
    updateEditorContent(nextContent, options)
  }

  if (options.deleteFile !== true) {
    updateMarkdownContent()
    return true
  }

  const deleteResult = await channelUtil.send({ event: 'delete-local-resource', data: assetInfo.resourceUrl })
  if (deleteResult?.ok === true) {
    updateMarkdownContent()
    const reasonMessageKey = getPreviewAssetDeleteReasonMessageKey(deleteResult.reason)
    if (deleteResult.reason !== 'deleted' && reasonMessageKey) {
      message.warning(t(reasonMessageKey))
    }
    return true
  }

  const reasonMessageKey = getPreviewAssetDeleteReasonMessageKey(deleteResult?.reason)
  if (shouldContinueMarkdownCleanup(deleteResult?.reason)) {
    updateMarkdownContent()
    message.warning(t(reasonMessageKey || 'previewAssetMenu.deleteFileFailed'))
    return true
  }

  message.warning(t(reasonMessageKey || 'previewAssetMenu.deleteFileFailed'))
  return false
}

async function deleteCurrentAssetReference(assetInfo, options = {}) {
  const removeResult = removeAssetFromMarkdown(content.value, assetInfo)
  if (!removeResult.removed) {
    message.warning(t('previewAssetMenu.removeMarkdownNotFound'))
    return false
  }
  return await applyAssetDelete(removeResult.content, assetInfo, {
    ...options,
    cursorPosition: removeResult.cursorPosition,
    focus: true,
    scrollIntoView: true,
  })
}

async function deleteAllAssetReferences(assetInfo, options = {}) {
  const removeResult = removeAllAssetReferencesFromMarkdown(content.value, assetInfo, {
    resolveComparablePath: resolveComparableAssetPath,
  })
  if (!removeResult.removed) {
    message.warning(t('previewAssetMenu.removeMarkdownNotFound'))
    return false
  }
  return await applyAssetDelete(removeResult.content, assetInfo, {
    deleteFile: options.deleteFile === true,
    cursorPosition: removeResult.cursorPosition,
    focus: true,
    scrollIntoView: true,
  })
}

async function requestSingleReferenceDelete(assetInfo, deletePlan) {
  const deleteFile = deletePlan?.deleteFileEnabled === true
  const reasonMessage = deletePlan?.reasonMessageKey
    ? t(deletePlan.reasonMessageKey)
    : t('previewAssetMenu.deleteFileFailed')

  Modal.confirm({
    title: t('prompt'),
    icon: createVNode(ExclamationCircleOutlined),
    content: deleteFile
      ? t('previewAssetMenu.deleteConfirm')
      : t('previewAssetMenu.referenceOnlyDeleteConfirm', { reason: reasonMessage }),
    okText: t('okText'),
    cancelText: t('cancelText'),
    onOk: async () => {
      await deleteCurrentAssetReference(assetInfo, { deleteFile })
    },
  })
}

async function confirmDeleteAllReferences() {
  const assetInfo = multiReferenceDeleteModal.value.asset
  if (!assetInfo || multiReferenceDeleteModal.value.loading) {
    return
  }
  multiReferenceDeleteModal.value.loading = true
  const success = await deleteAllAssetReferences(assetInfo, {
    deleteFile: multiReferenceDeleteModal.value.deleteFileEnabled === true,
  })
  multiReferenceDeleteModal.value.loading = false
  if (success) {
    closeMultiReferenceDeleteModal()
  }
}

async function confirmDeleteCurrentReferenceOnly() {
  const assetInfo = multiReferenceDeleteModal.value.asset
  if (!assetInfo || multiReferenceDeleteModal.value.loading) {
    return
  }
  multiReferenceDeleteModal.value.loading = true
  const success = await deleteCurrentAssetReference(assetInfo, { deleteFile: false })
  multiReferenceDeleteModal.value.loading = false
  if (success) {
    closeMultiReferenceDeleteModal()
  }
}

async function deletePreviewAsset() {
  const assetInfo = previewAssetMenu.value.asset
  if (!assetInfo) {
    return
  }

  const referenceCount = getAssetReferenceCount(assetInfo)
  const resourceInfo = await channelUtil.send({ event: 'get-local-resource-info', data: assetInfo.resourceUrl })
  const deletePlan = resolvePreviewAssetDeletePlan(resourceInfo, referenceCount)
  if (deletePlan.mode === 'blocked') {
    message.warning(t(deletePlan.blockMessageKey || 'previewAssetMenu.deleteFileFailed'))
    return
  }

  if (referenceCount <= 1) {
    await requestSingleReferenceDelete(assetInfo, deletePlan)
    return
  }

  multiReferenceDeleteModal.value = {
    open: true,
    asset: assetInfo,
    referenceCount,
    deleteFileEnabled: deletePlan.deleteFileEnabled,
    reasonMessageKey: deletePlan.reasonMessageKey,
    loading: false,
  }
}
</script>

<template>
  <MarkdownEdit v-if="ready" v-model="content" :association-highlight="config.editor.associationHighlight" :content-update-meta="contentUpdateMeta" :extension="config.editorExtension" class="h-full" :code-theme="config.theme.code" :preview-theme="config.theme.preview" :watermark="watermark" :theme="config.theme.global" @save="save" @asset-contextmenu="onAssetContextmenu" @asset-open="onAssetOpen" />
  <PreviewAssetContextMenu
    :open="previewAssetMenu.open"
    :x="previewAssetMenu.x"
    :y="previewAssetMenu.y"
    @close="closePreviewAssetMenu"
    @open-explorer="openPreviewAssetInExplorer"
    @delete="deletePreviewAsset"
  />
  <a-modal
    wrap-class-name="preview-asset-delete-modal"
    :open="multiReferenceDeleteModal.open"
    width="40rem"
    :mask-closable="multiReferenceDeleteModal.loading === false"
    :keyboard="multiReferenceDeleteModal.loading === false"
    :closable="multiReferenceDeleteModal.loading === false"
    centered
    @cancel="closeMultiReferenceDeleteModal"
  >
    <template #title>
      <div class="preview-asset-delete-title">
        <ExclamationCircleOutlined class="preview-asset-delete-title-icon" />
        <span>{{ t('prompt') }}</span>
      </div>
    </template>
    <div class="preview-asset-delete-body">
      <div class="preview-asset-delete-summary">
        {{ t('previewAssetMenu.referenceCountTip', { count: multiReferenceDeleteModal.referenceCount }) }}
      </div>
      <div v-if="multiReferenceDeleteModal.reasonMessageKey" class="preview-asset-delete-tip">
        {{ t('previewAssetMenu.referenceOnlyModeTip', { reason: t(multiReferenceDeleteModal.reasonMessageKey) }) }}
      </div>
      <div class="preview-asset-delete-option preview-asset-delete-option-warning">
        <div class="preview-asset-delete-option-title">
          {{ t('previewAssetMenu.deleteCurrentReferenceOnly') }}
        </div>
        <div class="preview-asset-delete-option-description">
          {{ multiReferenceDeleteModal.deleteFileEnabled
            ? t('previewAssetMenu.deleteCurrentReferenceOnlyTip', { count: Math.max(multiReferenceDeleteModal.referenceCount - 1, 0) })
            : t('previewAssetMenu.deleteCurrentReferenceOnlyMarkdownTip', { count: Math.max(multiReferenceDeleteModal.referenceCount - 1, 0) }) }}
        </div>
      </div>
      <div class="preview-asset-delete-option" :class="multiReferenceDeleteModal.deleteFileEnabled ? 'preview-asset-delete-option-danger' : 'preview-asset-delete-option-primary'">
        <div class="preview-asset-delete-option-title">
          {{ multiReferenceDeleteModal.deleteFileEnabled
            ? t('previewAssetMenu.deleteAllReferencesAndFile')
            : t('previewAssetMenu.deleteAllReferencesOnly') }}
        </div>
        <div class="preview-asset-delete-option-description">
          {{ multiReferenceDeleteModal.deleteFileEnabled
            ? t('previewAssetMenu.deleteAllReferencesAndFileTip', { count: multiReferenceDeleteModal.referenceCount })
            : t('previewAssetMenu.deleteAllReferencesOnlyTip', { count: multiReferenceDeleteModal.referenceCount }) }}
        </div>
      </div>
    </div>
    <template #footer>
      <div class="preview-asset-delete-footer">
        <a-button :disabled="multiReferenceDeleteModal.loading" @click="closeMultiReferenceDeleteModal">
          {{ t('cancelText') }}
        </a-button>
        <a-button :loading="multiReferenceDeleteModal.loading" @click="confirmDeleteCurrentReferenceOnly">
          {{ t('previewAssetMenu.deleteCurrentReferenceOnly') }}
        </a-button>
        <a-button :danger="multiReferenceDeleteModal.deleteFileEnabled" type="primary" :loading="multiReferenceDeleteModal.loading" @click="confirmDeleteAllReferences">
          {{ multiReferenceDeleteModal.deleteFileEnabled
            ? t('previewAssetMenu.deleteAllReferencesAndFile')
            : t('previewAssetMenu.deleteAllReferencesOnly') }}
        </a-button>
      </div>
    </template>
  </a-modal>
</template>

<style scoped lang="scss">
</style>

<style lang="scss">
.preview-asset-delete-modal {
  .ant-modal-content {
    overflow: hidden;
  }

  .preview-asset-delete-body {
    display: grid;
    gap: 12px;
  }

  .preview-asset-delete-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .preview-asset-delete-title-icon {
    color: #faad14;
    font-size: 18px;
  }

  .preview-asset-delete-summary {
    padding: 12px 14px;
    border-radius: 10px;
    background: #f5f7fa;
    color: #1f2329;
    font-size: 14px;
    line-height: 22px;
  }

  .preview-asset-delete-tip {
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(250, 173, 20, 0.1);
    color: #874d00;
    font-size: 13px;
    line-height: 21px;
  }

  .preview-asset-delete-option {
    padding: 14px 16px;
    border: 1px solid #d9e2f2;
    border-radius: 10px;
    background: #fff;
  }

  .preview-asset-delete-option-title {
    color: #1f2329;
    font-size: 14px;
    font-weight: 600;
    line-height: 22px;
  }

  .preview-asset-delete-option-description {
    margin-top: 6px;
    color: #5c667a;
    font-size: 13px;
    line-height: 21px;
  }

  .preview-asset-delete-option-warning {
    border-color: rgba(250, 173, 20, 0.3);
    background: rgba(250, 173, 20, 0.08);

    .preview-asset-delete-option-title {
      color: #ad6800;
    }

    .preview-asset-delete-option-description {
      color: #874d00;
    }
  }

  .preview-asset-delete-option-danger {
    border-color: rgba(245, 34, 45, 0.24);
    background: rgba(245, 34, 45, 0.04);

    .preview-asset-delete-option-title {
      color: #cf1322;
    }

    .preview-asset-delete-option-description {
      color: #7f1d1d;
    }
  }

  .preview-asset-delete-option-primary {
    border-color: rgba(22, 119, 255, 0.2);
    background: rgba(22, 119, 255, 0.04);

    .preview-asset-delete-option-title {
      color: #0958d9;
    }

    .preview-asset-delete-option-description {
      color: #1d39c4;
    }
  }

  .preview-asset-delete-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.2rem;

    .ant-btn {
      white-space: nowrap;
    }
  }
}

:root[theme='dark'] .preview-asset-delete-modal {
  .preview-asset-delete-title-icon {
    color: #ffd666;
  }

  .preview-asset-delete-summary {
    background: var(--wj-markdown-bg-secondary);
    color: var(--wj-markdown-text-primary);
  }

  .preview-asset-delete-tip {
    background: rgba(250, 173, 20, 0.14);
    color: #ffe7ba;
  }

  .preview-asset-delete-option {
    border-color: var(--wj-markdown-border-primary);
    background: var(--wj-markdown-bg-secondary);
  }

  .preview-asset-delete-option-title {
    color: var(--wj-markdown-text-primary);
  }

  .preview-asset-delete-option-description {
    color: var(--wj-markdown-text-secondary);
  }

  .preview-asset-delete-option-warning {
    border-color: rgba(255, 197, 61, 0.28);
    background: rgba(250, 173, 20, 0.14);

    .preview-asset-delete-option-title {
      color: #ffd666;
    }

    .preview-asset-delete-option-description {
      color: #ffe7ba;
    }
  }

  .preview-asset-delete-option-danger {
    border-color: rgba(255, 120, 117, 0.28);
    background: rgba(255, 77, 79, 0.12);

    .preview-asset-delete-option-title {
      color: #ffb3b1;
    }

    .preview-asset-delete-option-description {
      color: #ffd6d6;
    }
  }

  .preview-asset-delete-option-primary {
    border-color: rgba(64, 169, 255, 0.24);
    background: rgba(22, 119, 255, 0.12);

    .preview-asset-delete-option-title {
      color: #91caff;
    }

    .preview-asset-delete-option-description {
      color: #d6e4ff;
    }
  }
}

@media (max-width: 640px) {
  .preview-asset-delete-modal {
    .preview-asset-delete-footer {
      flex-direction: column;

      .ant-btn {
        width: 100%;
      }
    }
  }
}
</style>
