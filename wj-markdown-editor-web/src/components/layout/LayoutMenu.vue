<script setup>
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import { createVNode, h, onBeforeMount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import commonUtil from '@/util/commonUtil.js'
import {
  requestDocumentOpenByDialogAndOpen,
  requestDocumentOpenPathByInteraction,
} from '@/util/document-session/documentOpenInteractionService.js'
import {
  isDocumentOpenMissingResult,
  requestRecentClear,
} from '@/util/document-session/rendererDocumentCommandUtil.js'
import toggleFullScreenAction from '@/util/fullScreenActionUtil.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'

const { t } = useI18n()
const store = useCommonStore()

const menuList = ref([])
const shortcutKeyList = ref(store.config.shortcutKeyList)
const recentList = ref(store.recentList)
const isFullScreen = ref(store.isFullScreen)
const sidebarVisible = ref(store.sidebarVisible)

function getSidebarToggleLabel() {
  return t(sidebarVisible.value
    ? 'topMenu.view.children.closeSidebar'
    : 'topMenu.view.children.openSidebar')
}

function createMenuLabel(label, shortcutKeyId) {
  const keymap = getKeymapByShortcutKeyId(shortcutKeyId)
  return keymap ? commonUtil.createLabel(label, keymap) : label
}

const CHECK_INDICATOR_CLASS = 'i-tabler:check mr-1'
const PLACEHOLDER_INDICATOR_CLASS = 'mr-1 inline-block w-[1em]'

// 视图菜单组内存在勾选项时，组内所有项统一预留等宽占位，保证整列文本对齐。
function createIndicatorMenuLabel(label, shortcutKeyId, indicatorClass) {
  const keymap = getKeymapByShortcutKeyId(shortcutKeyId)
  const baseLabel = keymap ? commonUtil.createLabel(label, keymap) : label

  return h('div', { style: { display: 'flex', alignItems: 'center' } }, [
    h('span', { class: indicatorClass }),
    h('div', { style: { flex: 1 } }, [baseLabel]),
  ])
}

function sendExportStart(type, target) {
  channelUtil.send({
    event: 'export-start',
    data: {
      type,
      target,
    },
  })
}

function createRecentListVNode() {
  return recentList.value.map((item) => {
    return {
      key: commonUtil.createId(),
      label: commonUtil.createRecentLabel(item.path, item.name),
      click: () => {
        requestDocumentOpenPathByInteraction(item.path, {
          entrySource: 'recent',
          trigger: 'user',
        }).then((result) => {
          if (isDocumentOpenMissingResult(result)) {
            commonUtil.recentFileNotExists(item.path)
          }
        })
      },
    }
  })
}

onBeforeMount(() => {
  updateMenuList()
})

function updateMenuList() {
  const recentList = createRecentListVNode()
  if (recentList.length === 0) {
    recentList.push({
      key: commonUtil.createId(),
      label: t('topMenu.file.children.recentFiles.noHistory'),
      click: () => {},
    })
  } else {
    recentList.unshift({
      key: commonUtil.createId(),
      type: 'divider',
    })
    recentList.unshift({
      key: commonUtil.createId(),
      label: t('topMenu.file.children.recentFiles.clear'),
      click: () => {
        Modal.confirm({
          title: t('prompt'),
          icon: createVNode(ExclamationCircleOutlined),
          content: t('topMenu.file.children.recentFiles.clearTip'),
          okText: t('config.yes'),
          cancelText: t('config.no'),
          onOk: () => {
            requestRecentClear().then(() => {})
          },
        })
      },
    })
  }
  menuList.value = [
    {
      key: commonUtil.createId(),
      label: t('topMenu.file.name'),
      children: [
        {
          key: commonUtil.createId(),
          label: createMenuLabel(t('topMenu.file.children.createNew'), 'createNew'),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('createNew', true)
          },
        },
        {
          // “新建窗口”是并排查看的入口，与“新建标签”分开：
          // 它不再绑定快捷键，避免 Ctrl+N 同时承担两种语义。
          key: commonUtil.createId(),
          label: t('topMenu.file.children.createNewWindow'),
          click: () => {
            channelUtil.send({ event: 'create-new-window' }).then(() => {}).catch(() => {})
          },
        },
        {
          key: commonUtil.createId(),
          label: t('topMenu.file.children.recentFiles.name'),
          children: recentList,
        },
        {
          key: commonUtil.createId(),
          label: createMenuLabel(t('topMenu.file.children.openFile'), 'openFile'),
          click: () => {
            requestDocumentOpenByDialogAndOpen({
              entrySource: 'menu-open',
              trigger: 'user',
            }).then(() => {})
          },
        },
        {
          key: commonUtil.createId(),
          label: createMenuLabel(t('topMenu.file.children.saveFile'), 'save'),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('save', true)
          },
        },
        {
          key: commonUtil.createId(),
          label: createMenuLabel(t('topMenu.file.children.saveFileAs'), 'saveOther'),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('saveOther', true)
          },
        },
        {
          key: commonUtil.createId(),
          type: 'divider',
        },
        {
          key: commonUtil.createId(),
          label: t('topMenu.file.children.export.exportToFile'),
          children: [
            {
              key: commonUtil.createId(),
              label: 'PDF',
              click: () => { sendExportStart('PDF', 'file') },
            },
            {
              key: commonUtil.createId(),
              label: 'PNG',
              click: () => { sendExportStart('PNG', 'file') },
            },
            {
              key: commonUtil.createId(),
              label: 'JPEG',
              click: () => { sendExportStart('JPEG', 'file') },
            },
          ],
        },
        {
          key: commonUtil.createId(),
          label: t('topMenu.file.children.export.exportToClipboard'),
          children: [
            {
              key: commonUtil.createId(),
              label: 'PNG',
              click: () => { sendExportStart('PNG', 'clipboard') },
            },
            {
              key: commonUtil.createId(),
              label: 'JPEG',
              click: () => { sendExportStart('JPEG', 'clipboard') },
            },
          ],
        },
        {
          key: commonUtil.createId(),
          type: 'divider',
        },
        {
          key: commonUtil.createId(),
          label: createMenuLabel(t('topMenu.file.children.setting'), 'setting'),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('setting', true)
          },
        },
      ],
    },
    {
      key: commonUtil.createId(),
      label: t('topMenu.view.name'),
      children: [
        {
          key: commonUtil.createId(),
          label: createIndicatorMenuLabel(
            t('shortcutKey.viewSource'),
            'viewSource',
            store.viewMode === 'source' ? CHECK_INDICATOR_CLASS : PLACEHOLDER_INDICATOR_CLASS,
          ),
          click: () => {
            store.setViewMode('source')
          },
        },
        {
          key: commonUtil.createId(),
          label: createIndicatorMenuLabel(
            t('shortcutKey.viewSplit'),
            'viewSplit',
            store.viewMode === 'split' ? CHECK_INDICATOR_CLASS : PLACEHOLDER_INDICATOR_CLASS,
          ),
          click: () => {
            store.setViewMode('split')
          },
        },
        {
          key: commonUtil.createId(),
          label: createIndicatorMenuLabel(
            t('shortcutKey.viewPreview'),
            'viewPreview',
            store.viewMode === 'preview' ? CHECK_INDICATOR_CLASS : PLACEHOLDER_INDICATOR_CLASS,
          ),
          click: () => {
            store.setViewMode('preview')
          },
        },
        {
          key: commonUtil.createId(),
          type: 'divider',
        },
        {
          key: commonUtil.createId(),
          label: createIndicatorMenuLabel(
            t(isFullScreen.value ? 'topMenu.view.children.exitFullScreen' : 'topMenu.view.children.enterFullScreen'),
            'toggleFullScreen',
            PLACEHOLDER_INDICATOR_CLASS,
          ),
          click: () => {
            toggleFullScreenAction()
          },
        },
        {
          key: commonUtil.createId(),
          label: createIndicatorMenuLabel(
            getSidebarToggleLabel(),
            'toggleFileManagerPanel',
            PLACEHOLDER_INDICATOR_CLASS,
          ),
          click: () => {
            if (typeof store.setSidebarVisible === 'function') {
              store.setSidebarVisible(!store.sidebarVisible)
              return
            }

            store.sidebarVisible = !store.sidebarVisible
          },
        },
      ],
    },
    {
      key: commonUtil.createId(),
      label: t('topMenu.help.name'),
      children: [
        {
          label: t('topMenu.help.children.example'),
          click: () => {
            channelUtil.send({ event: 'open-guide' }).then(() => {})
          },
        },
        {
          label: t('topMenu.help.children.about'),
          click: () => {
            channelUtil.send({ event: 'open-about' }).then(() => {})
          },
        },
      ],
    },
  ]
}

watch(() => store.config.language, () => {
  updateMenuList()
}, { immediate: true })

watch(() => store.config.shortcutKeyList, (newValue) => {
  shortcutKeyList.value = newValue
  updateMenuList()
}, { deep: true })
watch(() => store.recentList, (newValue) => {
  recentList.value = newValue
  updateMenuList()
}, { deep: true })
watch(() => store.isFullScreen, (newValue) => {
  isFullScreen.value = newValue
  updateMenuList()
})
watch(() => store.sidebarVisible, (newValue) => {
  sidebarVisible.value = newValue
  updateMenuList()
})
watch(() => store.viewMode, () => {
  updateMenuList()
})

function getKeymapByShortcutKeyId(id) {
  const shortcutKey = shortcutKeyList.value.find(item => item.id === id && item.enabled === true)
  if (shortcutKey) {
    return shortcutKey.keymap
  }
  return ''
}

function handleMenuClick({ item }) {
  item.originItemValue.click && item.originItemValue.click()
}
</script>

<template>
  <div
    class="flex select-none items-center"
  >
    <a-dropdown
      v-for="(item, index) in menuList"
      :key="index"
      class="select-none"
      arrow
      placement="bottomLeft"
    >
      <div class="group h-8 flex cursor-pointer items-center px-0.5 font-size-3.5">
        <div class="h-7 flex items-center rounded-1 px-2 group-hover:bg-bg-hover">
          {{ item.label }}
        </div>
      </div>
      <template #overlay>
        <a-menu
          style="min-width: 200px"
          mode="vertical"
          :items="item.children"
          @click="handleMenuClick"
        />
      </template>
    </a-dropdown>
  </div>
</template>

<style scoped lang="scss">
:deep(.ant-dropdown-menu-item) {
  // 禁止选择
  user-select: none;
  // 禁止拖动
  -webkit-user-drag: none;
}
</style>
