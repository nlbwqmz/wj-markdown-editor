<template>
  <div style="width: 100%; display: flex; padding: 0 0 5px 5px;" class="forbid-select-drag">
    <a-dropdown :trigger="['hover']" v-for="(item, index) in menuList" :key="index" class="forbid-select-drag" arrow placement="bottomLeft">
      <div class="menu-item">
        <div class="menu-item-content">{{ item.label }}</div>
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

<script setup>

import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { createVNode, h } from 'vue'
import commonUtil from '@/util/commonUtil'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import { Modal, Tooltip } from 'ant-design-vue'
import store from '@/store'
const createLabel = (label, shortcuts) => {
  return h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, [
    h('div', {}, label),
    h('div', { style: { paddingLeft: '20px', color: 'rgb(199,199,199)' } }, shortcuts)
  ])
}

const menuList = [
  {
    key: commonUtil.createId(),
    label: '文件',
    children: [
      {
        key: commonUtil.createId(),
        label: createLabel('新建', 'ctrl+n'),
        click: nodeRequestUtil.newFile
      },
      {
        key: commonUtil.createId(),
        label: createLabel('保存', 'ctrl+s'),
        click: () => nodeRequestUtil.saveFile({ id: store.state.id })
      },
      {
        key: commonUtil.createId(),
        label: createLabel('另存为', 'ctrl+shift+s'),
        click: nodeRequestUtil.saveToOther
      },
      {
        key: commonUtil.createId(),
        type: 'divider'
      },
      {
        key: commonUtil.createId(),
        label: '导出',
        children: [
          {
            key: commonUtil.createId(),
            label: 'PDF',
            click: () => nodeRequestUtil.openExportWin('pdf')
          },
          {
            key: commonUtil.createId(),
            label: 'PNG',
            click: () => nodeRequestUtil.openExportWin('png')
          },
          {
            key: commonUtil.createId(),
            label: 'JPEG',
            click: () => nodeRequestUtil.openExportWin('jpeg')
          },
          {
            key: commonUtil.createId(),
            label: 'WEBP',
            click: () => nodeRequestUtil.openExportWin('webp')
          },
          {
            key: commonUtil.createId(),
            label: h(Tooltip, { title: '暂不支持导出webdav相对路径图片', 'auto-adjust-overflow': true, placement: 'right', color: '#1677ff' }, () => [
              h('div', {}, 'DOCX')
            ]),
            click: () => nodeRequestUtil.executeConvertFile('word')
          }
        ]
      },
      {
        key: commonUtil.createId(),
        type: 'divider'
      },
      {
        key: commonUtil.createId(),
        label: createLabel('设置', 'ctrl+alt+s'),
        click: nodeRequestUtil.openSettingWin
      },
      {
        key: commonUtil.createId(),
        label: '导出设置',
        click: nodeRequestUtil.exportSetting
      },
      {
        key: commonUtil.createId(),
        label: '导入设置',
        click: nodeRequestUtil.importSetting
      },
      {
        key: commonUtil.createId(),
        label: '恢复默认设置',
        click: () => {
          Modal.confirm({
            title: '恢复默认设置',
            icon: createVNode(ExclamationCircleOutlined),
            content: '当前操作无法撤销，确认恢复默认设置？',
            okText: '确认',
            cancelText: '取消',
            centered: true,
            onOk () {
              nodeRequestUtil.restoreDefaultSetting()
            }
          })
        }
      }
    ]
  },
  {
    key: commonUtil.createId(),
    label: '视图',
    children: [
      {
        label: createLabel('切换', 'ctrl+shift+/'),
        click: commonUtil.toggleView
      }
    ]
  },
  {
    key: commonUtil.createId(),
    label: '帮助',
    children: [
      {
        label: '关于',
        click: nodeRequestUtil.openAboutWin
      }
    ]
  }
]

const handleMenuClick = ({ item }) => {
  item.originItemValue.click && item.originItemValue.click()
}
</script>

<style scoped lang="less">
.menu-item {
  font-size: 12px;
  cursor: pointer;
  .menu-item-content {
    padding: 5px;
    border-radius: 3px;
    margin-right: 5px;
  }
  .menu-item-content:hover {
    background-color: rgb(237,237,237);
  }
  .active {
    background-color: rgb(237,237,237);
  }
}
:deep(.ant-dropdown-menu-item){
  // 禁止选择
  user-select: none;
  // 禁止拖动
  -webkit-user-drag: none;
}
</style>
