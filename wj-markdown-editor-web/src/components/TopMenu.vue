<template>
  <div style="width: 100%; display: flex; padding: 0 0 5px 5px;" class="forbid-select-drag">
    <a-dropdown :trigger="['click']" @open-change="openChange($event, index)" v-for="(item, index) in menuList" :key="index">
      <div class="menu-item">
        <div :class="commonUtil.arrFindIndex(activeMenu, index) > -1 ? 'menu-item-content active' : 'menu-item-content'">{{ item.name }}</div>
      </div>
      <template #overlay>
        <a-menu>
          <template v-for="(menu, menuIndex) in item.children" :key="menuIndex">
            <a-menu-divider v-if="menu.type === 'divider'"/>
            <a-menu-item v-else style="min-width: 200px" :key="menuIndex" class="forbid-select-drag">
              <div style="display: flex;justify-content: space-between;" @click="() => { openChange(false, index); menu.click && menu.click() }">
                <div>{{menu.name}}</div>
                <div class="shortcuts">{{menu.shortcuts}}</div>
              </div>
            </a-menu-item>
          </template>
        </a-menu>
      </template>
    </a-dropdown>
  </div>
</template>

<script setup>

import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { createVNode, ref } from 'vue'
import commonUtil from '@/util/commonUtil'
import nodeRequestUtil from '@/util/nodeRequestUtil'
import { Modal } from 'ant-design-vue'

const activeMenu = ref([])
const menuList = [
  {
    name: '文件',
    children: [
      {
        name: '新建',
        shortcuts: 'ctrl+n',
        click: nodeRequestUtil.newFile
      },
      {
        name: '保存',
        shortcuts: 'ctrl+s',
        click: () => nodeRequestUtil.save(false)
      },
      {
        name: '另存为',
        shortcuts: 'ctrl+shift+s',
        click: nodeRequestUtil.saveToOther
      },
      {
        type: 'divider'
      },
      {
        name: '导出为PDF',
        click: nodeRequestUtil.exportPdf
      },
      {
        type: 'divider'
      },
      {
        name: '设置',
        shortcuts: 'ctrl+alt+s',
        click: nodeRequestUtil.openSettingWin
      },
      {
        name: '导出设置',
        click: nodeRequestUtil.exportSetting
      },
      {
        name: '导入设置',
        click: nodeRequestUtil.importSetting
      },
      {
        name: '恢复默认设置',
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
    name: '视图',
    children: [
      {
        name: '切换',
        shortcuts: 'ctrl+shift+/',
        click: commonUtil.toggleView
      }
    ]
  },
  {
    name: '帮助',
    children: [
      {
        name: '关于',
        click: nodeRequestUtil.openAboutWin
      }
    ]
  }
]

const openChange = (open, key) => {
  const index = commonUtil.arrFindIndex(activeMenu.value, key)
  if (open && index < 0) {
    activeMenu.value.push(key)
  } else {
    if (index > -1) {
      activeMenu.value.splice(index, 1)
    }
  }
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
.shortcuts {
  padding-left: 20px;
  color: rgb(199,199,199);
}
</style>
