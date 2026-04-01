<script setup>
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Modal, Tooltip } from 'ant-design-vue'
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
const fileManagerPanelVisible = ref(store.fileManagerPanelVisible)

function joinMenuLabel(segmentList) {
  const compactLocale = String(store.config.language || '').toLowerCase().startsWith('zh')
  return segmentList.filter(Boolean).join(compactLocale ? '' : ' ')
}

function getFileManagerToggleLabel() {
  const labelKey = fileManagerPanelVisible.value
    ? 'topMenu.view.children.hideFileManager'
    : 'topMenu.view.children.showFileManager'
  const translatedLabel = t(labelKey)

  if (translatedLabel !== labelKey) {
    return translatedLabel
  }

  return joinMenuLabel([
    t(fileManagerPanelVisible.value ? 'config.disable' : 'config.enable'),
    t('config.view.defaultShowFileManager'),
  ])
}

function createMenuLabel(label, shortcutKeyId) {
  const keymap = getKeymapByShortcutKeyId(shortcutKeyId)
  return keymap ? commonUtil.createLabel(label, keymap) : label
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
          label: t('topMenu.file.children.export.name'),
          children: [
            {
              key: commonUtil.createId(),
              label: h(Tooltip, { 'title': t('topMenu.file.children.export.pdfTip'), 'auto-adjust-overflow': true, 'placement': 'right', 'color': '#1677ff' }, () => [
                h('div', {}, 'PDF'),
              ]),
              click: () => { channelUtil.send({ event: 'export-start', data: 'PDF' }) },
            },
            {
              key: commonUtil.createId(),
              label: 'PNG',
              click: () => { channelUtil.send({ event: 'export-start', data: 'PNG' }) },
            },
            {
              key: commonUtil.createId(),
              label: 'JPEG',
              click: () => { channelUtil.send({ event: 'export-start', data: 'JPEG' }) },
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
          label: createMenuLabel(t('topMenu.view.children.switchView'), 'switchView'),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('switchView', true)
          },
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
          label: createMenuLabel(getFileManagerToggleLabel(), 'toggleFileManagerPanel'),
          click: () => {
            if (typeof store.setFileManagerPanelVisible === 'function') {
              store.setFileManagerPanelVisible(!store.fileManagerPanelVisible)
              return
            }

            store.fileManagerPanelVisible = !store.fileManagerPanelVisible
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
watch(() => store.fileManagerPanelVisible, (newValue) => {
  fileManagerPanelVisible.value = newValue
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
