<script setup>
import { ExclamationCircleFilled } from '@ant-design/icons-vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import channelUtil from '@/util/channel/channelUtil.js'
import { waitForStartupLoadingDismissed } from '@/util/startupLoadingUtil.js'

/**
 * 启动恢复标签组时的“已跳过文件”提示。
 *
 * 数据通道是主动拉取而不是推送：主进程在开窗前就把跳过列表写进窗口状态，
 * 这里挂载后消费一次即可，拿到后主进程立即清空，
 * 组件重挂载或页面刷新都不会重复弹窗。
 *
 * 弹窗必须等启动遮罩移除后再打开，否则会在遮罩底下把打开动画播完。
 *
 * 用声明式 `a-modal` 渲染，避免命令式 Modal 脱离当前主题上下文。
 */
const { t } = useI18n()

const visible = ref(false)
const pathList = ref([])

function resolvePathList(rawPathList) {
  if (!Array.isArray(rawPathList)) {
    return []
  }

  return rawPathList.filter(item => typeof item === 'string' && item.trim() !== '')
}

async function requestStartupSkippedTabs() {
  let rawPathList = null
  try {
    rawPathList = await channelUtil.send({
      event: 'window.consume-startup-skipped-tabs',
    })
  }
  catch {
    // 拉取失败时静默放弃：启动提示不是关键路径，不能影响编辑页可用性。
    return []
  }

  return resolvePathList(rawPathList)
}

function close() {
  visible.value = false
}

onMounted(() => {
  // 先发起拉取、再等遮罩移除：数据在路上时就绪，遮罩一撤弹窗立即出现，
  // 不额外多等一次 IPC 往返。
  const pendingPathList = requestStartupSkippedTabs()
  waitForStartupLoadingDismissed().then(async () => {
    const nextPathList = await pendingPathList
    if (nextPathList.length === 0) {
      return
    }

    pathList.value = nextPathList
    visible.value = true
  })
})
</script>

<template>
  <a-modal
    wrap-class-name="startup-skipped-tabs-modal"
    :open="visible"
    :mask-closable="false"
    :keyboard="false"
    width="32rem"
    centered
    @cancel="close"
  >
    <!-- 标题图标对齐 antd Modal.warning 的黄色感叹号，保持提示语义一致。 -->
    <template #title>
      <span class="startup-skipped-tabs__title">
        <ExclamationCircleFilled class="startup-skipped-tabs__title-icon" />
        <span>{{ t('prompt') }}</span>
      </span>
    </template>
    <div class="startup-skipped-tabs">
      <p class="startup-skipped-tabs__summary">
        {{ t('message.startupSkippedTabs', { total: pathList.length }) }}
      </p>
      <ul class="startup-skipped-tabs__list wj-scrollbar">
        <li
          v-for="path in pathList"
          :key="path"
          class="startup-skipped-tabs__item"
          :title="path"
        >
          {{ path }}
        </li>
      </ul>
    </div>
    <template #footer>
      <a-button type="primary" @click="close">
        {{ t('okText') }}
      </a-button>
    </template>
  </a-modal>
</template>

<style scoped lang="scss">
.startup-skipped-tabs {
  &__title {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }

  // antd 警告色，与 Modal.warning 默认图标保持一致。
  &__title-icon {
    font-size: 20px;
    color: #faad14;
  }

  &__summary {
    margin: 0 0 8px;
    line-height: 1.6;
    color: var(--wj-markdown-text-primary);
  }

  &__list {
    max-height: 240px;
    margin: 0;
    padding: 8px 12px;
    overflow-y: auto;
    list-style: none;
    background: var(--wj-markdown-bg-secondary);
    border: 1px solid var(--wj-markdown-border-primary);
    border-radius: 4px;
  }

  &__item {
    padding: 4px 0;
    overflow-wrap: anywhere;
    font-family: var(--code-area-font);
    font-size: 12px;
    line-height: 1.5;
    color: var(--wj-markdown-text-secondary);

    & + & {
      border-top: 1px solid var(--wj-markdown-border-primary);
    }
  }
}
</style>
