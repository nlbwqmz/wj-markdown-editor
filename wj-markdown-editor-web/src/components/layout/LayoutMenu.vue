<script setup>
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import commonUtil from '@/util/commonUtil.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Modal, Tooltip } from 'ant-design-vue'
import { createVNode, h, onBeforeMount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const menuList = ref([])
const shortcutKeyList = ref(useCommonStore().config.shortcutKeyList)
const recentList = ref(useCommonStore().recentList)

function createRecentListVNode() {
  return recentList.value.map((item) => {
    return {
      key: commonUtil.createId(),
      label: commonUtil.createRecentLabel(item.path, item.name),
      click: () => {
        channelUtil.send({ event: 'open-file', data: item.path }).then((exists) => {
          if (exists === false) {
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
            channelUtil.send({ event: 'recent-clear' })
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
          label: commonUtil.createLabel(t('topMenu.file.children.createNew'), getKeymapByShortcutKeyId('createNew')),
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
          label: commonUtil.createLabel(t('topMenu.file.children.openFile'), getKeymapByShortcutKeyId('openFile')),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('openFile', true)
          },
        },
        {
          key: commonUtil.createId(),
          label: commonUtil.createLabel(t('topMenu.file.children.saveFile'), getKeymapByShortcutKeyId('save')),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('save', true)
          },
        },
        {
          key: commonUtil.createId(),
          label: commonUtil.createLabel(t('topMenu.file.children.saveFileAs'), getKeymapByShortcutKeyId('saveOther')),
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
          label: commonUtil.createLabel(t('topMenu.file.children.setting'), getKeymapByShortcutKeyId('setting')),
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
          label: commonUtil.createLabel(t('topMenu.view.children.switchView'), getKeymapByShortcutKeyId('switchView')),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('switchView', true)
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

watch(() => useCommonStore().config.language, () => {
  updateMenuList()
}, { immediate: true })

watch(() => useCommonStore().config.shortcutKeyList, (newValue) => {
  shortcutKeyList.value = newValue
  updateMenuList()
}, { deep: true })
watch(() => useCommonStore().recentList, (newValue) => {
  recentList.value = newValue
  updateMenuList()
}, { deep: true })

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
