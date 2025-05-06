<script setup>
import OtherLayout from '@/components/layout/OtherLayout.vue'
import channelUtil from '@/util/channel/channelUtil.js'
import constant from '@/util/constant.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { computed, createVNode, h, onMounted, ref, watch } from 'vue'
import PickColors from 'vue-pick-colors'

const config = ref()

const anchorList = [
  { key: '-1', href: '#general', title: '常规' },
  { key: '0', href: '#view', title: '视图' },
  { key: '1', href: '#file', title: '文件' },
  { key: '3', href: '#image', title: '图片' },
  { key: '4', href: '#imageBed', title: '图床' },
  { key: '5', href: '#shortcut', title: '快捷键' },
  { key: '6', href: '#watermark', title: '水印' },
]

const imageBedUploaderList = ref([
  { value: 'github', name: 'GitHub' },
  { value: 'smms', name: 'SM.MS' },
])

const codeThemeList = constant.codeThemeList
const previewThemeList = constant.previewThemeList

function getAnchorContainer() {
  return window.document.getElementById('wj-other-layout-container')
}

watch(() => config.value, (newValue) => {
  channelUtil.send({ event: 'user-update-config', data: JSON.parse(JSON.stringify(newValue)) })
}, { deep: true })

// 是否显示图片绝对路径
const showImgAbsolutePath = computed(() => {
  return config.value.imgLocal === '2' || config.value.imgNetwork === '2'
})

// 是否显示图片相对路径
const showImgRelativePath = computed(() => {
  return config.value.imgLocal === '4' || config.value.imgNetwork === '4'
})
onMounted(async () => {
  window.document.title = '设置'
  config.value = await channelUtil.send({ event: 'get-config' })
})

const disallowedShortcutKeys = ['Backspace', 'Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+ArrowUp', 'Shift+Alt+ArrowUp', 'Alt+ArrowDown', 'Shift+Alt+ArrowDown', 'Escape', 'Ctrl+Enter', 'Alt+l', 'Ctrl+i', 'Ctrl+[', 'Ctrl+]', 'Ctrl+Alt+\\', 'Shift+Ctrl+k', 'Shift+Ctrl+\\', 'Ctrl+/', 'Alt+A', 'Ctrl+m', 'ArrowLeft', 'Ctrl+ArrowLeft', 'ArrowRight', 'Ctrl+ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'Ctrl+Home', 'End', 'Ctrl+End', 'Enter', 'Ctrl+a', 'Backspace', 'Delete', 'Ctrl+Backspace', 'Ctrl+Delete', 'Ctrl+f', 'F3', 'Ctrl+g', 'Escape', 'Ctrl+Shift+l', 'Ctrl+Alt+g', 'Ctrl+d', 'Ctrl+z', 'Ctrl+y', 'Ctrl+u', 'Alt+u', 'Ctrl+Space', 'Escape', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Enter', 'Tab', 'Ctrl+c', 'Ctrl+v']

/**
 * 监听修改快捷键
 */
function onKeydown(shortcutKey) {
  return (e) => {
    if (shortcutKeyUtil.isShortcutKey(e)) {
      const keymap = shortcutKeyUtil.getShortcutKey(e)
      const otherShortcutKeyList = config.value.shortcutKeyList.filter(item => item.id !== shortcutKey.id)
      for (let i = 0; i < otherShortcutKeyList.length; i++) {
        if (otherShortcutKeyList[i].keymap === keymap) {
          const vNode = h('span', {}, [
            h('span', {}, '与'),
            h('span', { style: { color: '#FAAD14', fontWeight: 'bold' } }, otherShortcutKeyList[i].name),
            h('span', {}, '快捷键冲突'),
          ])
          message.warn(vNode)
          return
        }
        if (disallowedShortcutKeys.includes(keymap)) {
          message.warn('与系统快捷键冲突')
          return
        }
      }
      shortcutKey.keymap = keymap
    }
  }
}

/**
 * 快捷键聚焦
 */
function onShortcutKeyFocus(e, shortcutKey) {
  const handler = onKeydown(shortcutKey)
  window.addEventListener('keydown', handler)
  e.target.addEventListener('blur', () => {
    window.removeEventListener('keydown', handler)
  }, { once: true })
}

/**
 * 选择图片绝对路径
 */
async function openDirSelect() {
  config.value.imgAbsolutePath = await channelUtil.send({ event: 'open-dir-select' })
}

// 选择文件绝对路径
async function openFileDirSelect() {
  config.value.fileAbsolutePath = await channelUtil.send({ event: 'open-dir-select' })
}

function settingMinimize() {
  channelUtil.send({ event: 'setting-minimize' })
}
function settingClose() {
  channelUtil.send({ event: 'setting-close' })
}
function reset() {
  Modal.confirm({
    title: '恢复默认设置',
    icon: createVNode(ExclamationCircleOutlined),
    content: '当前操作无法撤销，确认恢复默认设置？',
    okText: '确认',
    cancelText: '取消',
    centered: true,
    onOk: async () => {
      config.value = await channelUtil.send({ event: 'get-default-config' })
      return true
    },
  })
}
</script>

<template>
  <OtherLayout icon="i-tabler:settings" name="设置">
    <template #action>
      <a-tooltip placement="bottom" color="#1677ff">
        <template #title>
          <span>恢复默认设置</span>
        </template>
        <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-[rgb(237,237,237)]" @click="reset">
          <div class="i-tabler:settings-off" />
        </div>
      </a-tooltip>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-[rgb(237,237,237)]" @click="settingMinimize">
        <div class="i-tabler:minus" />
      </div>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-red" @click="settingClose">
        <div class="i-tabler:x" />
      </div>
    </template>
    <div v-if="config" class="w-full flex gap-2 p-2 p-t-0">
      <div class="w-full flex flex-1 flex-col">
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="general">常规</span>
          </template>
          <a-descriptions-item>
            <template #label>
              <div class="flex items-center gap-1">
                <span>启动页</span>
                <a-tooltip placement="top" color="#1677ff">
                  <template #title>
                    有内容时生效
                  </template>
                  <div class="i-tabler:info-circle font-size-4 color-[rgb(199,199,199)] hover:color-black" />
                </a-tooltip>
              </div>
            </template>
            <a-radio-group v-model:value="config.startPage" button-style="solid">
              <a-radio-button value="editor">
                编辑
              </a-radio-button>
              <a-radio-button value="preview">
                预览
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item label="打开最近一次记录">
            <a-radio-group v-model:value="config.openRecent" button-style="solid">
              <a-radio-button :value="true">
                是
              </a-radio-button>
              <a-radio-button :value="false">
                否
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item label="最近历史记录数量">
            <a-input-number v-model:value="config.recentMax" :min="0" :max="50" class="w-full" />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="view">视图</span>
          </template>
          <a-descriptions-item label="默认显示菜单">
            <a-radio-group v-model:value="config.menuVisible" button-style="solid">
              <a-radio-button :value="true">
                是
              </a-radio-button>
              <a-radio-button :value="false">
                否
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item label="代码主题">
            <a-select
              v-model:value="config.theme.code"
              class="w-full"
            >
              <a-select-option v-for="item in codeThemeList" :key="item" :value="item">
                {{ item }}
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="预览主题">
            <a-select
              v-model:value="config.theme.preview"
              class="w-full"
            >
              <a-select-option v-for="item in previewThemeList" :key="item" :value="item">
                {{ item }}
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="预览宽度">
            <a-slider
              v-model:value="config.previewWidth"
              :min="20"
              :max="100"
            />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="file">文件</span>
          </template>
          <a-descriptions-item label="文件">
            <a-select
              v-model:value="config.fileMode"
              class="w-full"
            >
              <a-select-option value="2">
                保存到绝对路径
              </a-select-option>
              <a-select-option value="3">
                保存到 ./%{filename} 文件夹
              </a-select-option>
              <a-select-option value="4">
                保存到相对路径
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.fileMode === '2'" label="绝对路径">
            <a-input
              v-model:value="config.fileAbsolutePath"
              readonly
            >
              <template #addonAfter>
                <div class="i-tabler:folder cursor-pointer" @click="openFileDirSelect" />
              </template>
            </a-input>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.fileMode === '4'" label="相对路径">
            <a-input v-model:value="config.fileRelativePath" />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="image">图片</span>
          </template>
          <a-descriptions-item label="本地图片">
            <a-select
              v-model:value="config.imgLocal"
              class="w-full"
            >
              <a-select-option value="2">
                保存到绝对路径
              </a-select-option>
              <a-select-option value="3">
                保存到 ./%{filename} 文件夹
              </a-select-option>
              <a-select-option value="4">
                保存到相对路径
              </a-select-option>
              <a-select-option value="5">
                上传到图床
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item label="网络图片">
            <a-select
              v-model:value="config.imgNetwork"
              class="w-full"
            >
              <a-select-option value="1">
                无操作
              </a-select-option>
              <a-select-option value="2">
                保存到绝对路径
              </a-select-option>
              <a-select-option value="3">
                保存到 ./%{filename} 文件夹
              </a-select-option>
              <a-select-option value="4">
                保存到相对路径
              </a-select-option>
              <a-select-option value="5">
                上传到图床
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item v-if="showImgAbsolutePath" label="绝对路径">
            <a-input
              v-model:value="config.imgAbsolutePath"
              readonly
            >
              <template #addonAfter>
                <div class="i-tabler:folder cursor-pointer" @click="openDirSelect" />
              </template>
            </a-input>
          </a-descriptions-item>
          <a-descriptions-item v-if="showImgRelativePath" label="相对路径">
            <a-input v-model:value="config.imgRelativePath" />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="imageBed">图床</span>
          </template>
          <a-descriptions-item label="图床">
            <a-select
              v-model:value="config.imageBed.uploader"
              class="w-full"
            >
              <a-select-option v-for="item in imageBedUploaderList" :key="item.value" :value="item.value">
                {{ item.name }}
              </a-select-option>
            </a-select>
          </a-descriptions-item>

          <!-- smms -->
          <a-descriptions-item v-if="config.imageBed.uploader === 'smms'" label="token">
            <a-input-password v-model:value="config.imageBed.smms.token" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.imageBed.uploader === 'smms'" label="备用域名">
            <a-input v-model:value="config.imageBed.smms.backupDomain" />
          </a-descriptions-item>

          <!-- github -->
          <a-descriptions-item v-if="config.imageBed.uploader === 'github'" label="仓库">
            <a-input v-model:value="config.imageBed.github.repo" placeholder="owner/repo" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.imageBed.uploader === 'github'" label="token">
            <a-input-password v-model:value="config.imageBed.github.token" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.imageBed.uploader === 'github'" label="存储路径">
            <a-input v-model:value="config.imageBed.github.path" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.imageBed.uploader === 'github'" label="分支">
            <a-input v-model:value="config.imageBed.github.branch" placeholder="main" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.imageBed.uploader === 'github'" label="自定义域名">
            <a-input v-model:value="config.imageBed.github.customUrl" />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="shortcut">快捷键</span>
          </template>
          <a-descriptions-item v-for="item in config.shortcutKeyList" :key="item.id" :label="item.name">
            <a-input
              v-model:value="item.keymap"
              readonly
              class="select-none"
              @focus="onShortcutKeyFocus($event, item)"
            >
              <template #addonAfter>
                <a-checkbox v-model:checked="item.enabled" />
              </template>
            </a-input>
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="watermark">水印</span>
          </template>
          <a-descriptions-item label="水印">
            <a-radio-group v-model:value="config.watermark.enabled" button-style="solid">
              <a-radio-button :value="true">
                开启
              </a-radio-button>
              <a-radio-button :value="false">
                关闭
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" label="预览水印">
            <a-radio-group v-model:value="config.watermark.previewEnabled" button-style="solid">
              <a-radio-button :value="true">
                开启
              </a-radio-button>
              <a-radio-button :value="false">
                关闭
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" label="水印时间">
            <a-radio-group v-model:value="config.watermark.dateEnabled" button-style="solid">
              <a-radio-button :value="true">
                开启
              </a-radio-button>
              <a-radio-button :value="false">
                关闭
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" label="时间格式">
            <a-select v-model:value="config.watermark.datePattern" class="w-full">
              <a-select-option value="YYYY-MM-DD">
                年-月-日
              </a-select-option>
              <a-select-option value="YYYY-MM-DD HH:mm:ss">
                年-月-日 时:分:秒
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" label="内容">
            <a-input v-model:value="config.watermark.content" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" label="旋转角度">
            <a-slider
              v-model:value="config.watermark.rotate"
              :min="-180"
              :max="180"
            />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" label="间隔宽度">
            <a-slider
              v-model:value="config.watermark.gap[0]"
              :min="10"
              :max="500"
            />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" label="间隔高度">
            <a-slider
              v-model:value="config.watermark.gap[1]"
              :min="10"
              :max="500"
            />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" label="字体大小">
            <a-slider
              v-model:value="config.watermark.font.fontSize"
              :min="12"
              :max="100"
            />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" label="字体粗细">
            <a-slider
              v-model:value="config.watermark.font.fontWeight"
              :min="200"
              :max="1000"
            />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" label="字体颜色">
            <PickColors
              v-model:value="config.watermark.font.color"
              show-alpha
            />
          </a-descriptions-item>
        </a-descriptions>
      </div>
      <div>
        <a-affix :offset-top="50">
          <a-anchor
            :affix="false"
            :items="anchorList"
            :get-container="getAnchorContainer"
            @click="(e) => { e.preventDefault() }"
          />
        </a-affix>
      </div>
    </div>
  </OtherLayout>
</template>

<style scoped lang="scss">
:deep(.ant-descriptions-item-label) {
  width: 150px;
}
:deep(.ant-anchor-wrapper) {
  padding-block-start: revert;
}
:deep(.ant-radio-button-wrapper) {
  min-width: 60px;
  text-align: center;
}
:deep(.ant-descriptions-title) {
  user-select: none;
  span {
    display: inline-block;
    padding-top: 20px;
  }
}
:deep(.ant-descriptions-item-label) {
  user-select: none;
}
</style>
