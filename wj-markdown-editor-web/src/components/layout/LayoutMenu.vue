<script setup>
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import commonUtil from '@/util/commonUtil.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import { createVNode, onBeforeMount, ref, watch } from 'vue'

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
      label: '无',
      click: () => {},
    })
  } else {
    recentList.unshift({
      key: commonUtil.createId(),
      type: 'divider',
    })
    recentList.unshift({
      key: commonUtil.createId(),
      label: '清空最近历史',
      click: () => {
        Modal.confirm({
          title: '提示',
          icon: createVNode(ExclamationCircleOutlined),
          content: '确认清空所有历史记录？',
          okText: '确认',
          cancelText: '取消',
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
      label: '文件',
      children: [
        {
          key: commonUtil.createId(),
          label: commonUtil.createLabel('新建', getKeymapByShortcutKeyId('createNew')),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('createNew', true)
          },
        },
        {
          key: commonUtil.createId(),
          label: '最近',
          children: recentList,
        },
        {
          key: commonUtil.createId(),
          label: commonUtil.createLabel('打开', getKeymapByShortcutKeyId('openFile')),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('openFile', true)
          },
        },
        {
          key: commonUtil.createId(),
          label: commonUtil.createLabel('保存', getKeymapByShortcutKeyId('save')),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('save', true)
          },
        },
        {
          key: commonUtil.createId(),
          label: commonUtil.createLabel('另存为', getKeymapByShortcutKeyId('saveOther')),
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
          label: '导出',
          children: [
            {
              key: commonUtil.createId(),
              label: 'PDF',
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
          label: commonUtil.createLabel('设置', getKeymapByShortcutKeyId('setting')),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('setting', true)
          },
        },
      ],
    },
    {
      key: commonUtil.createId(),
      label: '视图',
      children: [
        {
          label: commonUtil.createLabel('切换', getKeymapByShortcutKeyId('switchView')),
          click: () => {
            shortcutKeyUtil.getWebShortcutKeyHandler('switchView', true)
          },
        },
      ],
    },
    {
      key: commonUtil.createId(),
      label: '帮助',
      children: [
        {
          label: '示例',
          click: () => {
            channelUtil.send({ event: 'open-guide' }).then(() => {})
          },
        },
        {
          label: '关于',
          click: () => {
            channelUtil.send({ event: 'open-about' }).then(() => {})
          },
        },
      ],
    },
  ]
}

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
      :trigger="['hover']"
      class="select-none"
      arrow
      placement="bottomLeft"
    >
      <div class="cursor-pointer font-size-3.5">
        <div class="m-r-1 rounded-1 p-1 hover:bg-[rgb(237,237,237)]">
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
