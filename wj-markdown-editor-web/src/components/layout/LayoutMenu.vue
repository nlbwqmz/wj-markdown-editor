<script setup>
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import { createVNode, onBeforeMount, ref, watch } from 'vue'
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
          label: createMenuLabel(t('shortcutKey.viewSource'), 'viewSource'),
          click: () => {
            store.setViewMode('source')
          },
        },
        {
          key: commonUtil.createId(),
          label: createMenuLabel(t('shortcutKey.viewSplit'), 'viewSplit'),
          click: () => {
            store.setViewMode('split')
          },
        },
        {
          key: commonUtil.createId(),
          label: createMenuLabel(t('shortcutKey.viewPreview'), 'viewPreview'),
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
          label: createMenuLabel(t(isFullScreen.value ? 'topMenu.view.children.exitFullScreen' : 'topMenu.view.children.enterFullScreen'), 'toggleFullScreen'),
          click: () => {
            toggleFullScreenAction()
          },
        },
        {
          key: commonUtil.createId(),
          label: createMenuLabel(getSidebarToggleLabel(), 'toggleFileManagerPanel'),
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
    class="w-full flex select-none p-b-1.5 p-l-1"
  >
    <a-dropdown
      v-for="(item, index) in menuList"
      :key="index"
      class="select-none"
      arrow
      placement="bottomLeft"
    >
      <div class="cursor-pointer font-size-3.5">
        <div class="m-r-1 rounded-1 p-1 hover:bg-bg-hover">
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
