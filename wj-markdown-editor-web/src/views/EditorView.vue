<script setup>
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import dayjs from 'dayjs'
import { createVNode, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave } from 'vue-router'
import MarkdownEdit from '@/components/editor/MarkdownEdit.vue'
import PreviewAssetContextMenu from '@/components/editor/PreviewAssetContextMenu.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import { syncClosePromptSnapshot } from '@/util/channel/closePromptSyncService.js'
import eventEmit from '@/util/channel/eventEmit.js'
import commonUtil from '@/util/commonUtil.js'
import {
  DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT,
} from '@/util/document-session/documentSessionEventUtil.js'
import {
  requestDocumentEdit,
  requestDocumentSave,
  requestDocumentSessionSnapshot,
} from '@/util/document-session/rendererDocumentCommandUtil.js'
import {
  resolveRendererSessionActivationAction,
  shouldBootstrapSessionSnapshotOnMounted,
} from '@/util/document-session/rendererSessionActivationStrategy.js'
import { createRendererSessionEventSubscription } from '@/util/document-session/rendererSessionEventSubscription.js'
import { createRendererSessionSnapshotController } from '@/util/document-session/rendererSessionSnapshotController.js'
import { shouldSuppressNextContentSync } from '@/util/editor/contentUpdateMetaUtil.js'
import { createPreviewAssetDeleteConfirmController } from '@/util/editor/previewAssetDeleteConfirmController.js'
import {
  getPreviewAssetDeleteReasonMessageKey,
  resolvePreviewAssetDeletePlan,
} from '@/util/editor/previewAssetDeleteDecisionUtil.js'
import {
  countRemainingAssetReferences,
  removeAllAssetReferencesFromMarkdown,
  removeAssetFromMarkdown,
  shouldCleanupMarkdownAfterDeleteResult,
} from '@/util/editor/previewAssetRemovalUtil.js'
import { createPreviewAssetSessionController } from '@/util/editor/previewAssetSessionController.js'
import { createEditorViewActivationRestoreScheduler } from '@/views/editorViewActivationRestoreScheduler.js'

// 预览资源右键菜单的基础状态工厂。
// 每次关闭菜单时都重新生成一份干净状态，避免复用旧引用。
function createPreviewAssetMenuState() {
  return {
    open: false,
    x: 0,
    y: 0,
    asset: null,
    actionContext: null,
  }
}

// “删除多处引用”弹窗的基础状态工厂。
// 这里除了展示数据，还会记录当前删除操作是否处于进行中。
function createMultiReferenceDeleteModalState() {
  return {
    open: false,
    asset: null,
    actionContext: null,
    referenceCount: 0,
    deleteFileEnabled: false,
    reasonMessageKey: null,
    loading: false,
  }
}

const content = ref('')
// 仅在拿到首份文档快照后再渲染编辑器，避免子组件接收到空内容后再闪动更新。
const ready = ref(false)
// 通过子组件暴露的方法统一处理编辑器正文 flush 与滚动锚点恢复。
const markdownEditRef = ref()
const { t } = useI18n()
const store = useCommonStore()
// 预览区水印配置，由 store.config 派生得到。
const watermark = ref()
// 当前编辑器完整配置缓存，模板中直接使用。
const config = ref()
// 向 MarkdownEdit 传递一次性的内容更新元信息，用于控制光标、聚焦和滚动定位。
const contentUpdateMeta = ref({
  token: 0,
  cursorPosition: null,
  focus: false,
  scrollIntoView: false,
})
// 预览资源右键菜单状态。
const previewAssetMenu = ref(createPreviewAssetMenuState())
// 预览资源存在多处引用时使用的二次确认弹窗状态。
const multiReferenceDeleteModal = ref(createMultiReferenceDeleteModalState())
// 每次主动更新编辑器内容时递增，强制子组件识别为一轮新的外部同步。
let contentUpdateToken = 0
// 标记当前这次 content 变更是否来自 session snapshot，
// 用于阻止 watch(content) 再次把同一份内容回写给主进程。
let applyingSessionContent = false
// 单资源删除确认弹窗控制器，统一托管 confirm 实例的打开和销毁。
const previewAssetDeleteConfirmController = createPreviewAssetDeleteConfirmController({
  createModal: config => Modal.confirm(config),
})
// 预览资源相关操作的会话上下文控制器。
// 它负责判断“当前 UI 上看到的资源信息”是否仍然对应当前文档，
// 避免切换文档后继续对旧文档资源执行打开、删除等动作。
const previewAssetSessionController = createPreviewAssetSessionController({
  // 资源菜单、多引用删除弹窗都绑定在“当前正文 + 当前文档路径”上下文上。
  // 只要 snapshot 已经换成了新的正文或新的文档身份，就必须立刻把旧 UI 失效掉，
  // 避免后续还拿着过期 assetInfo 继续删文件或回写旧 Markdown。
  onContextInvalidated: () => {
    previewAssetDeleteConfirmController.destroy()
    closePreviewAssetMenu()
    closeMultiReferenceDeleteModal({ force: true })
  },
})
// 编辑页与 document session snapshot 的协调控制器。
// 负责处理首次加载、激活重放、竞态保护以及“最近文件不存在”提示同步。
const editorSessionSnapshotController = createRendererSessionSnapshotController({
  applySnapshot: (snapshot) => {
    applyDocumentSessionSnapshot(snapshot)
  },
  promptRecentMissing: commonUtil.recentFileNotExists,
  syncClosePrompt: syncClosePromptSnapshot,
  store,
})
// 激活恢复调度器负责把“激活窗口内最新 snapshot identity”延迟到 nextTick 后再下发给子组件。
const activationRestoreScheduler = createEditorViewActivationRestoreScheduler({
  cancelActiveRestore: () => {
    markdownEditRef.value?.cancelPendingViewScrollRestore?.()
  },
  restoreSnapshot: (snapshotIdentity) => {
    markdownEditRef.value?.scheduleRestoreForCurrentSnapshot(snapshotIdentity)?.then(() => {})
  },
})

// 统一封装“把外部内容应用到编辑器”的过程。
// 除了正文本身，还会一起生成本次更新的元数据，供子组件恢复光标和滚动位置。
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

// 触发文档保存，请求具体由 rendererDocumentCommandUtil 转给主进程处理。
function save() {
  requestDocumentSave().then(() => {})
}

// 把 document session snapshot 应用到当前编辑页。
// 当前页面展示的正文、资源上下文和 ready 状态都以 snapshot 为唯一事实来源。
function applyDocumentSessionSnapshot(snapshot) {
  if (!snapshot) {
    return
  }

  previewAssetSessionController.syncSnapshot(snapshot)
  // 编辑器内容现在只从 document session snapshot 同步，
  // 避免再和历史遗留的零散元信息入口混写。
  updateEditorContent(snapshot.content, {
    skipContentSync: true,
  })
  ready.value = true
  activationRestoreScheduler.applySnapshot(snapshot)
}

// 响应主进程或其他链路推送过来的 session snapshot 更新。
function onDocumentSessionSnapshotChanged(snapshot) {
  editorSessionSnapshotController.applyPushedSnapshot(snapshot)
}

// 订阅“当前文档快照变更”事件。
// activate/deactivate 会在 keep-alive 生命周期里成对调用，避免页面失活时继续接收事件。
const documentSessionSnapshotSubscription = createRendererSessionEventSubscription({
  eventName: DOCUMENT_SESSION_RENDERER_SNAPSHOT_CHANGED_EVENT,
  listener: onDocumentSessionSnapshotChanged,
  addListener: (eventName, listener) => eventEmit.on(eventName, listener),
  removeListener: (eventName, listener) => eventEmit.remove(eventName, listener),
})

// 主动拉取当前文档快照，主要用于首次进入页面或 keep-alive 恢复后需要补齐数据的场景。
async function loadCurrentDocumentSessionSnapshot() {
  const requestContext = editorSessionSnapshotController.beginBootstrapRequest()
  const snapshot = await requestDocumentSessionSnapshot()
  editorSessionSnapshotController.applyBootstrapSnapshot(requestContext, snapshot)
}

onMounted(async () => {
  // 组件挂载时先激活快照控制器和事件订阅，为后续首次加载做好准备。
  editorSessionSnapshotController.activate()
  documentSessionSnapshotSubscription.activate()
  // KeepAlive 页面首次进入时，真正的“进入策略”统一交给 onActivated。
  // 这样 mounted 不会再和 activated 双发 bootstrap。
  if (shouldBootstrapSessionSnapshotOnMounted({
    insideKeepAlive: true,
  }) === true) {
    await loadCurrentDocumentSessionSnapshot()
  }
})

onActivated(() => {
  // keep-alive 恢复后重新接管快照流。
  activationRestoreScheduler.markPendingRestore()
  editorSessionSnapshotController.activate()
  documentSessionSnapshotSubscription.activate()
  const activationAction = resolveRendererSessionActivationAction({
    hasAppliedSnapshot: editorSessionSnapshotController.hasAppliedSnapshot?.() === true,
    needsBootstrapOnActivate: editorSessionSnapshotController.needsBootstrapOnActivate?.() === true,
    storeSnapshot: store.documentSessionSnapshot,
  })

  if (activationAction === 'replay-store') {
    // 编辑页在 keep-alive 恢复时优先重放 store 里的最新真快照，
    // 这样就算当前视图自己的首轮 bootstrap 曾经失效，只要别的活动链路已经把 store 推进到真相，
    // 本页也能立刻恢复正文，而不用继续空白等待下一次 IPC。
    editorSessionSnapshotController.replaySnapshot(store.documentSessionSnapshot)
    return
  }

  if (activationAction === 'request-bootstrap') {
    loadCurrentDocumentSessionSnapshot().then(() => {})
  }
})

onBeforeUnmount(() => {
  // 组件真正销毁时释放所有订阅和上下文，避免后续异步结果回写到已卸载页面。
  editorSessionSnapshotController.dispose()
  documentSessionSnapshotSubscription.dispose()
  previewAssetSessionController.invalidateActiveContext({
    reason: 'before-unmount',
  })
})

onDeactivated(() => {
  // keep-alive 暂时失活时停止接收事件，并让资源相关 UI 全部失效。
  activationRestoreScheduler.cancelPendingRestore()
  editorSessionSnapshotController.deactivate()
  documentSessionSnapshotSubscription.deactivate()
  previewAssetSessionController.invalidateActiveContext({
    reason: 'deactivated',
  })
})

onBeforeRouteLeave(async () => {
  // 切页前必须先把 CodeMirror 里尚未上浮的正文冲刷出来，
  // 否则后续请求到的 snapshot revision 可能仍停留在旧版本。
  markdownEditRef.value?.flushPendingModelSync?.()

  // route leave 需要拿“最终正文对应的稳定 snapshot identity”来记录锚点。
  // 如果当前正文尚未同步进主进程，就优先等待 document.edit 返回最新快照；
  // 只有已经同步好的场景，才直接读取 session snapshot。
  const latestSnapshot = content.value !== (store.documentSessionSnapshot?.content ?? '')
    ? (await requestDocumentEdit(content.value))?.snapshot || await requestDocumentSessionSnapshot()
    : await requestDocumentSessionSnapshot()

  markdownEditRef.value?.captureViewScrollAnchors?.({
    sessionId: latestSnapshot?.sessionId ?? null,
    revision: Number.isInteger(latestSnapshot?.revision) ? latestSnapshot.revision : 0,
  })
})

watch(() => content.value, (newValue, oldValue) => {
  if (newValue !== oldValue) {
    if (applyingSessionContent) {
      // 由 snapshot 驱动的内容替换不应再次回写主进程，
      // 否则容易把“外部应用后的最终内容”误当成新的手工编辑。
      applyingSessionContent = false
      return
    }
    // 编辑器里每次真实内容变化，都经由统一命令工具发送 `document.edit`。
    // Electron 侧会再把它收口到 session 命令流，统一裁决保存态和外部变更。
    requestDocumentEdit(newValue).then(() => {})
  }
})

watch(() => store.config, (newValue) => {
  // store.config 是总配置入口，这里把预览区真正需要的水印结构整理出来。
  // 日期启用时会把当天格式化结果拼接进水印内容中。
  const tempWatermark = JSON.parse(JSON.stringify(newValue.watermark))
  tempWatermark.content = tempWatermark.content ? tempWatermark.content : 'wj-markdown-editor'
  if (tempWatermark.dateEnabled === true) {
    tempWatermark.content = [tempWatermark.content, dayjs(new Date()).format(tempWatermark.datePattern)]
  }
  tempWatermark.enabled = tempWatermark.enabled && tempWatermark.previewEnabled
  watermark.value = tempWatermark
  config.value = newValue
}, { deep: true, immediate: true })

// 关闭资源右键菜单，并清空关联的资源与上下文。
function closePreviewAssetMenu() {
  previewAssetMenu.value = createPreviewAssetMenuState()
}

// 预览区资源右键菜单入口。
// 除了记录点击位置，也会同步捕获当下文档上下文，后续所有操作都基于这份快照校验。
function onAssetContextmenu(assetInfo) {
  previewAssetMenu.value = {
    open: true,
    x: assetInfo.clientX,
    y: assetInfo.clientY,
    asset: assetInfo,
    actionContext: previewAssetSessionController.captureActionContext(),
  }
}

// 从右键菜单里打开资源所在目录。
// 如果菜单携带的上下文已经失效，说明用户可能切换过文档，此时直接关闭菜单并放弃操作。
function openPreviewAssetInExplorer() {
  const assetInfo = previewAssetMenu.value.asset
  const actionContext = previewAssetMenu.value.actionContext
  if (!assetInfo?.resourceUrl || previewAssetSessionController.isActiveContext(actionContext) !== true) {
    closePreviewAssetMenu()
    return
  }
  channelUtil.send({
    event: 'document.resource.open-in-folder',
    data: {
      resourceUrl: assetInfo.resourceUrl,
      rawPath: assetInfo.rawPath,
      requestContext: previewAssetSessionController.createRequestContext(actionContext),
    },
  })
}

// 双击或其他“打开资源”动作，逻辑上与右键菜单中的“在文件夹中打开”一致。
function onAssetOpen(assetInfo) {
  const actionContext = previewAssetSessionController.captureActionContext()
  if (!assetInfo?.resourceUrl || previewAssetSessionController.isActiveContext(actionContext) !== true) {
    return
  }
  channelUtil.send({
    event: 'document.resource.open-in-folder',
    data: {
      resourceUrl: assetInfo.resourceUrl,
      rawPath: assetInfo.rawPath,
      requestContext: previewAssetSessionController.createRequestContext(actionContext),
    },
  })
}

// 将资源原始路径归一化为可比较 key。
// 这一步交给主进程做，是为了统一处理不同平台路径、大小写或协议形式的差异。
function resolveComparableAssetPath(rawPath) {
  if (!rawPath) {
    return null
  }
  return channelUtil.sendSync({
    event: 'resource.get-comparable-key',
    data: {
      rawPath,
    },
  }) || rawPath
}

// 关闭“多处引用删除”弹窗。
// 非强制关闭时，如果删除流程仍在执行，就保持弹窗打开，避免用户中途打断状态流转。
function closeMultiReferenceDeleteModal(options = {}) {
  if (options.force !== true && multiReferenceDeleteModal.value.loading) {
    return
  }
  multiReferenceDeleteModal.value = createMultiReferenceDeleteModalState()
}

// 统计当前文档中还剩多少处对该资源的引用。
function getAssetReferenceCount(assetInfo) {
  return countRemainingAssetReferences(content.value, assetInfo, {
    resolveComparablePath: resolveComparableAssetPath,
  })
}

// 统一处理“更新 Markdown 内容”和“删除本地文件”两段流程。
// options.deleteFile 为 false 时仅改正文；为 true 时会在正文更新前先请求主进程删除本地资源。
async function applyAssetDelete(nextContent, assetInfo, options = {}) {
  // 只有操作上下文仍然有效时，才允许把新的 Markdown 内容应用到当前编辑器。
  const updateMarkdownContent = () => {
    if (previewAssetSessionController.isActiveContext(options.actionContext) !== true) {
      return false
    }
    updateEditorContent(nextContent, options)
    return true
  }

  if (options.deleteFile !== true) {
    return updateMarkdownContent()
  }

  const deleteResult = await channelUtil.send({
    event: 'document.resource.delete-local',
    data: {
      resourceUrl: assetInfo.resourceUrl,
      requestContext: previewAssetSessionController.createRequestContext(options.actionContext),
    },
  })
  if (previewAssetSessionController.isActiveContext(options.actionContext) !== true) {
    return false
  }
  if (deleteResult?.ok === true) {
    // 删除文件成功后，再把 Markdown 中对应引用移除。
    if (updateMarkdownContent() !== true) {
      return false
    }
    const reasonMessageKey = getPreviewAssetDeleteReasonMessageKey(deleteResult.reason)
    if (deleteResult.reason !== 'deleted' && reasonMessageKey) {
      message.warning(t(reasonMessageKey))
    }
    return true
  }

  const reasonMessageKey = getPreviewAssetDeleteReasonMessageKey(deleteResult?.reason)
  if (shouldCleanupMarkdownAfterDeleteResult(deleteResult)) {
    if (updateMarkdownContent() !== true) {
      return false
    }
    message.warning(t(reasonMessageKey || 'previewAssetMenu.deleteFileFailed'))
    return true
  }

  message.warning(t(reasonMessageKey || 'previewAssetMenu.deleteFileFailed'))
  return false
}

// 仅删除当前命中的这一次资源引用。
async function deleteCurrentAssetReference(assetInfo, options = {}) {
  if (previewAssetSessionController.isActiveContext(options.actionContext) !== true) {
    return false
  }
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

// 删除当前文档中对该资源的全部引用。
// 是否顺带删除本地文件，由 options.deleteFile 决定。
async function deleteAllAssetReferences(assetInfo, options = {}) {
  if (previewAssetSessionController.isActiveContext(options.actionContext) !== true) {
    return false
  }
  const removeResult = removeAllAssetReferencesFromMarkdown(content.value, assetInfo, {
    resolveComparablePath: resolveComparableAssetPath,
  })
  if (!removeResult.removed) {
    message.warning(t('previewAssetMenu.removeMarkdownNotFound'))
    return false
  }
  return await applyAssetDelete(removeResult.content, assetInfo, {
    deleteFile: options.deleteFile === true,
    actionContext: options.actionContext,
    cursorPosition: removeResult.cursorPosition,
    focus: true,
    scrollIntoView: true,
  })
}

// 单引用场景的确认弹窗。
// 如果当前策略不允许删本地文件，则退化为“仅删除 Markdown 引用”的提示文案。
async function requestSingleReferenceDelete(assetInfo, deletePlan, actionContext) {
  const deleteFile = deletePlan?.deleteFileEnabled === true
  const reasonMessage = deletePlan?.reasonMessageKey
    ? t(deletePlan.reasonMessageKey)
    : t('previewAssetMenu.deleteFileFailed')

  previewAssetDeleteConfirmController.open({
    title: t('prompt'),
    icon: createVNode(ExclamationCircleOutlined),
    content: deleteFile
      ? t('previewAssetMenu.deleteConfirm')
      : t('previewAssetMenu.referenceOnlyDeleteConfirm', { reason: reasonMessage }),
    okText: t('okText'),
    cancelText: t('cancelText'),
    onOk: async () => {
      await deleteCurrentAssetReference(assetInfo, {
        deleteFile,
        actionContext,
      })
    },
  })
}

// 多引用弹窗中，执行“删除全部引用”或“删除全部引用并删除文件”。
async function confirmDeleteAllReferences() {
  const assetInfo = multiReferenceDeleteModal.value.asset
  if (!assetInfo || multiReferenceDeleteModal.value.loading) {
    return
  }
  multiReferenceDeleteModal.value.loading = true
  const success = await deleteAllAssetReferences(assetInfo, {
    actionContext: multiReferenceDeleteModal.value.actionContext,
    deleteFile: multiReferenceDeleteModal.value.deleteFileEnabled === true,
  })
  multiReferenceDeleteModal.value.loading = false
  if (success) {
    closeMultiReferenceDeleteModal()
  }
}

// 多引用弹窗中，仅删除当前命中的这一处引用，保留其余引用。
async function confirmDeleteCurrentReferenceOnly() {
  const assetInfo = multiReferenceDeleteModal.value.asset
  if (!assetInfo || multiReferenceDeleteModal.value.loading) {
    return
  }
  multiReferenceDeleteModal.value.loading = true
  const success = await deleteCurrentAssetReference(assetInfo, {
    deleteFile: false,
    actionContext: multiReferenceDeleteModal.value.actionContext,
  })
  multiReferenceDeleteModal.value.loading = false
  if (success) {
    closeMultiReferenceDeleteModal()
  }
}

// 预览资源删除入口。
// 先获取引用数和资源信息，再根据策略决定：
// 1. 直接阻止删除
// 2. 单引用直接弹确认框
// 3. 多引用弹出分支选择对话框
async function deletePreviewAsset() {
  const assetInfo = previewAssetMenu.value.asset
  const actionContext = previewAssetMenu.value.actionContext
  if (!assetInfo || previewAssetSessionController.isActiveContext(actionContext) !== true) {
    closePreviewAssetMenu()
    return
  }

  const referenceCount = getAssetReferenceCount(assetInfo)
  const resourceInfo = await channelUtil.send({
    event: 'resource.get-info',
    data: {
      resourceUrl: assetInfo.resourceUrl,
      requestContext: previewAssetSessionController.createRequestContext(actionContext),
    },
  })
  if (previewAssetSessionController.isActiveContext(actionContext) !== true) {
    return
  }
  const deletePlan = resolvePreviewAssetDeletePlan(resourceInfo, referenceCount)
  if (deletePlan.mode === 'blocked') {
    message.warning(t(deletePlan.blockMessageKey || 'previewAssetMenu.deleteFileFailed'))
    return
  }

  if (referenceCount <= 1) {
    await requestSingleReferenceDelete(assetInfo, deletePlan, actionContext)
    return
  }

  multiReferenceDeleteModal.value = {
    open: true,
    asset: assetInfo,
    actionContext,
    referenceCount,
    deleteFileEnabled: deletePlan.deleteFileEnabled,
    reasonMessageKey: deletePlan.reasonMessageKey,
    loading: false,
  }
}
</script>

<template>
  <!-- 主编辑器：正文、主题、水印和资源事件都在这里汇总。 -->
  <MarkdownEdit v-if="ready" ref="markdownEditRef" v-model="content" :association-highlight="config.editor.associationHighlight" :content-update-meta="contentUpdateMeta" :extension="config.editorExtension" class="h-full" :code-theme="config.theme.code" :preview-theme="config.theme.preview" :watermark="watermark" :theme="config.theme.global" @save="save" @asset-contextmenu="onAssetContextmenu" @asset-open="onAssetOpen" />
  <!-- 预览资源右键菜单，仅负责展示与转发操作，不直接处理业务。 -->
  <PreviewAssetContextMenu
    :open="previewAssetMenu.open"
    :x="previewAssetMenu.x"
    :y="previewAssetMenu.y"
    @close="closePreviewAssetMenu"
    @open-explorer="openPreviewAssetInExplorer"
    @delete="deletePreviewAsset"
  />
  <!-- 当同一资源在当前文档中被多次引用时，使用这个弹窗让用户明确选择删除范围。 -->
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
// 多引用删除弹窗样式。
// 这里使用全局样式而不是 scoped，是为了覆盖 Ant Design Vue 的弹窗结构。
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
  // 暗色主题下单独调整边框、背景和文字颜色，保持风险提示层级清晰。
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
    // 移动端把底部按钮改成纵向堆叠，避免横向挤压导致文案截断。
    .preview-asset-delete-footer {
      flex-direction: column;

      .ant-btn {
        width: 100%;
      }
    }
  }
}
</style>
