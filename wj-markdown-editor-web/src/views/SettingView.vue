<script setup>
import OtherLayout from '@/components/layout/OtherLayout.vue'
import TypographerDescription from '@/components/TypographerDescription.vue'
import { useCommonStore } from '@/stores/counter.js'
import channelUtil from '@/util/channel/channelUtil.js'
import constant from '@/util/constant.js'
import shortcutKeyUtil from '@/util/shortcutKeyUtil.js'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { computed, createVNode, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { ColorPicker } from 'vue3-colorpicker'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const store = useCommonStore()

const config = ref()

// 用于更新字体大小时，刷新锚点组件
const anchorKey = ref(1)

const systemFontList = ref([])

const anchorList = computed(() => [
  { key: '-1', href: '#general', title: t('config.title.general') },
  { key: '9', href: '#font', title: t('config.title.fontFamily') },
  { key: '0', href: '#view', title: t('config.title.view') },
  { key: '1', href: '#editor', title: t('config.title.editor') },
  { key: '2', href: '#file', title: t('config.title.file') },
  { key: '3', href: '#image', title: t('config.title.picture') },
  { key: '4', href: '#imageBed', title: t('config.title.pictureBed') },
  { key: '5', href: '#shortcut', title: t('config.title.shortcut') },
  { key: '6', href: '#watermark', title: t('config.title.watermark') },
  { key: '7', href: '#export', title: t('config.title.export') },
])

const imageBedUploaderList = ref([
  { value: 'github', name: 'GitHub' },
  { value: 'smms', name: 'SM.MS' },
])

const autoSaveOptionList = computed(() => [
  {
    label: t('config.general.autoSaveOption.onWindowBlur'),
    value: 'blur',
  },
  {
    label: t('config.general.autoSaveOption.onWindowClose'),
    value: 'close',
  },
])

const codeThemeList = constant.codeThemeList
const previewThemeList = constant.previewThemeList

function refreshSystemFontList() {
  if (document.visibilityState === 'visible') {
    window.queryLocalFonts().then((fonts) => {
      const list = []
      const familySet = new Set(fonts.map(font => font.family))
      familySet.forEach((family) => {
        const label = fonts.filter(font => font.family === family).sort((a, b) => a.fullName.length - b.fullName.length)[0].fullName
        list.push({
          value: family,
          label: family === label ? family : `${family} (${label})`,
        })
      })
      systemFontList.value = list
    }).catch((e) => {
      message.error(e.message)
    })
  }
}

function systemFontSelectFilterOption(inputValue, option) {
  return option.label.toLowerCase().includes(inputValue.toLowerCase())
}

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
  config.value = await channelUtil.send({ event: 'get-config' })
  refreshSystemFontList()
  window.addEventListener('visibilitychange', refreshSystemFontList)
  watch(() => config.value.fontSize, () => {
    anchorKey.value++
  })
})

onUnmounted(() => {
  window.removeEventListener('visibilitychange', refreshSystemFontList)
})

watch(() => store.config.language, () => {
  window.document.title = t('config.modalTitle')
}, { immediate: true })

watch(() => store.config.theme.global, (newValue) => {
  if (newValue !== config.value.theme.global) {
    config.value.theme.global = newValue
  }
})

watch(() => store.config.language, (newValue) => {
  if (newValue !== config.value.language) {
    config.value.language = newValue
  }
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
          if (config.value.language === 'zh-CN') {
            const vNode = h('span', {}, [
              h('span', {}, '与 '),
              h('span', { style: { color: '#FAAD14', fontWeight: 'bold' } }, t(`shortcutKey.${otherShortcutKeyList[i].id}`)),
              h('span', {}, ' 快捷键冲突'),
            ])
            message.warn(vNode)
          } else {
            const vNode = h('span', {}, [
              h('span', {}, 'Shortcut key conflict with '),
              h('span', { style: { color: '#FAAD14', fontWeight: 'bold' } }, t(`shortcutKey.${otherShortcutKeyList[i].id}`)),
            ])
            message.warn(vNode)
          }

          return
        }
        if (disallowedShortcutKeys.includes(keymap)) {
          message.warn(t('shortcutKey.conflictWithSystemShortcutKey'))
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
    title: t('config.resetToDefault'),
    icon: createVNode(ExclamationCircleOutlined),
    content: t('config.resetToDefaultTip'),
    okText: t('okText'),
    cancelText: t('cancelText'),
    centered: true,
    onOk: async () => {
      config.value = await channelUtil.send({ event: 'get-default-config' })
      return true
    },
  })
}
</script>

<template>
  <OtherLayout icon="i-tabler:settings" :name="$t('config.modalTitle')">
    <template #action>
      <a-tooltip placement="bottom" color="#1677ff">
        <template #title>
          <span>{{ $t('config.resetToDefault') }}</span>
        </template>
        <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-bg-hover" @click="reset">
          <div class="i-tabler:settings-off" />
        </div>
      </a-tooltip>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-bg-hover" @click="settingMinimize">
        <div class="i-tabler:minus" />
      </div>
      <div class="h-8 w-8 flex items-center justify-center hover:cursor-pointer hover:bg-red" @click="settingClose">
        <div class="i-tabler:x" />
      </div>
    </template>
    <div v-if="config" class="allow-search w-full flex gap-2 p-2 p-t-0">
      <div class="w-full flex flex-1 flex-col">
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="general">{{ $t('config.title.general') }}</span>
          </template>
          <a-descriptions-item :label="$t('config.general.language')">
            <a-select
              v-model:value="config.language"
              class="w-full"
            >
              <a-select-option value="zh-CN">
                中文
              </a-select-option>
              <a-select-option value="en-US">
                English
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item>
            <template #label>
              <div class="flex items-center gap-1">
                <span>{{ $t('config.general.startupView') }}</span>
                <a-tooltip placement="topRight" color="#1677ff" class="flex-shrink-0">
                  <template #title>
                    {{ $t('config.general.startupViewOption.tip') }}
                  </template>
                  <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
                </a-tooltip>
              </div>
            </template>
            <a-radio-group v-model:value="config.startPage" button-style="solid">
              <a-radio-button value="editor">
                {{ $t('config.general.startupViewOption.edit') }}
              </a-radio-button>
              <a-radio-button value="preview">
                {{ $t('config.general.startupViewOption.preview') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.general.openLastRecord')">
            <a-radio-group v-model:value="config.openRecent" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.yes') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.no') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.general.recentHistoryCount')">
            <a-input-number v-model:value="config.recentMax" :min="0" :max="50" class="w-full" :controls="false" />
          </a-descriptions-item>
          <a-descriptions-item>
            <template #label>
              <div class="flex items-center gap-1">
                <span>{{ $t('config.general.autoSave') }}</span>
                <a-tooltip placement="topRight" color="#1677ff" class="flex-shrink-0">
                  <template #title>
                    {{ $t('config.general.autoSaveOption.tip') }}
                  </template>
                  <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
                </a-tooltip>
              </div>
            </template>
            <a-checkbox-group v-model:value="config.autoSave" :options="autoSaveOptionList" />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <div id="font" class="flex items-center gap-1">
              <span>{{ $t('config.title.fontFamily') }}</span>
              <a-tooltip placement="topRight" color="#1677ff" class="flex-shrink-0">
                <template #title>
                  {{ $t('config.fontFamily.tip') }}
                </template>
                <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
              </a-tooltip>
            </div>
          </template>
          <a-descriptions-item :label="$t('config.fontFamily.editArea')">
            <a-select v-model:value="config.fontFamily.editArea" :options="systemFontList" class="w-full" :filter-option="systemFontSelectFilterOption" allow-clear show-search @change="value => config.fontFamily.editArea = value === undefined ? '' : value" />
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.fontFamily.previewArea')">
            <a-select v-model:value="config.fontFamily.previewArea" :options="systemFontList" class="w-full" :filter-option="systemFontSelectFilterOption" allow-clear show-search @change="value => config.fontFamily.previewArea = value === undefined ? '' : value" />
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.fontFamily.codeArea')">
            <a-select v-model:value="config.fontFamily.codeArea" :options="systemFontList" class="w-full" :filter-option="systemFontSelectFilterOption" allow-clear show-search @change="value => config.fontFamily.codeArea = value === undefined ? '' : value" />
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.fontFamily.otherArea')">
            <a-select v-model:value="config.fontFamily.otherArea" :options="systemFontList" class="w-full" :filter-option="systemFontSelectFilterOption" show-search allow-clear @change="value => config.fontFamily.otherArea = value === undefined ? '' : value" />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="view">{{ $t('config.title.view') }}</span>
          </template>
          <a-descriptions-item :label="$t('config.view.defaultShowOutline')">
            <a-radio-group v-model:value="config.menuVisible" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.yes') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.no') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.view.globalTheme')">
            <a-radio-group v-model:value="config.theme.global" button-style="solid">
              <a-radio-button value="light">
                {{ $t('config.view.globalThemeOption.light') }}
              </a-radio-button>
              <a-radio-button value="dark">
                {{ $t('config.view.globalThemeOption.dark') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.view.codeTheme')">
            <a-select
              v-model:value="config.theme.code"
              class="w-full"
            >
              <a-select-option v-for="item in codeThemeList" :key="item" :value="item">
                {{ item }}
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.view.previewTheme')">
            <a-select
              v-model:value="config.theme.preview"
              class="w-full"
            >
              <a-select-option v-for="item in previewThemeList" :key="item" :value="item">
                {{ item }}
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.view.previewWidth')">
            <a-slider
              v-model:value="config.previewWidth"
              :min="20"
              :max="100"
            />
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.view.fontSize')">
            <a-slider
              v-model:value="config.fontSize"
              :min="14"
              :max="28"
            />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="editor">{{ $t('config.title.editor') }}</span>
          </template>
          <a-descriptions-item :label="$t('config.editor.lineNumber')">
            <a-radio-group v-model:value="config.editorExtension.lineNumbers" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.yes') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.no') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.editor.lineWrapping')">
            <a-radio-group v-model:value="config.editorExtension.lineWrapping" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.yes') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.no') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.editor.highlightActiveLine')">
            <a-radio-group v-model:value="config.editorExtension.highlightActiveLine" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.yes') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.no') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item>
            <template #label>
              <div class="flex items-center gap-1">
                <span>{{ $t('config.editor.highlightMatchingText') }}</span>
                <a-tooltip placement="topRight" color="#1677ff" class="flex-shrink-0">
                  <template #title>
                    {{ $t('config.editor.highlightMatchingTextOption.tip') }}
                  </template>
                  <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
                </a-tooltip>
              </div>
            </template>
            <a-radio-group v-model:value="config.editorExtension.highlightSelectionMatches" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.yes') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.no') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.editor.highlightMatchingBracket')">
            <a-radio-group v-model:value="config.editorExtension.bracketMatching" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.yes') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.no') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.editor.autoCloseBracket')">
            <a-radio-group v-model:value="config.editorExtension.closeBrackets" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.yes') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.no') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item>
            <template #label>
              <div class="flex items-center gap-1">
                <span>{{ $t('config.editor.typographer') }}</span>
                <a-popover trigger="hover" placement="topRight" color="#1677ff">
                  <template #title>
                    <span class="color-white">{{ $t('config.editor.typographerOption.tipTitle') }}</span>
                  </template>
                  <template #content>
                    <TypographerDescription />
                  </template>
                  <div class="i-tabler:info-circle font-size-4 op-50 hover:op-100" />
                </a-popover>
              </div>
            </template>
            <a-radio-group v-model:value="config.markdown.typographer" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.yes') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.no') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="file">{{ $t('config.title.file') }}</span>
          </template>
          <a-descriptions-item :label="$t('config.file.file')">
            <a-select
              v-model:value="config.fileMode"
              class="w-full"
            >
              <a-select-option value="2">
                {{ $t('config.saveOption.saveToAbsolutePath') }}
              </a-select-option>
              <a-select-option value="3">
                {{ $t('config.saveOption.saveToFilenameFolder') }}
              </a-select-option>
              <a-select-option value="4">
                {{ $t('config.saveOption.saveTorelativePath') }}
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.fileMode === '2'" :label="$t('config.file.absolutePath')">
            <a-input
              v-model:value="config.fileAbsolutePath"
              readonly
            >
              <template #addonAfter>
                <div class="i-tabler:folder cursor-pointer" style="color: var(--wj-markdown-text-primary)" @click="openFileDirSelect" />
              </template>
            </a-input>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.fileMode === '4'" :label="$t('config.file.relativePath')">
            <a-input v-model:value="config.fileRelativePath" />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="image">{{ $t('config.title.picture') }}</span>
          </template>
          <a-descriptions-item :label="$t('config.picture.localPicture')">
            <a-select
              v-model:value="config.imgLocal"
              class="w-full"
            >
              <a-select-option value="2">
                {{ $t('config.saveOption.saveToAbsolutePath') }}
              </a-select-option>
              <a-select-option value="3">
                {{ $t('config.saveOption.saveToFilenameFolder') }}
              </a-select-option>
              <a-select-option value="4">
                {{ $t('config.saveOption.saveTorelativePath') }}
              </a-select-option>
              <a-select-option value="5">
                {{ $t('config.saveOption.uploadToPictureBed') }}
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.picture.networkPicture')">
            <a-select
              v-model:value="config.imgNetwork"
              class="w-full"
            >
              <a-select-option value="1">
                {{ $t('config.saveOption.noOperation') }}
              </a-select-option>
              <a-select-option value="2">
                {{ $t('config.saveOption.saveToAbsolutePath') }}
              </a-select-option>
              <a-select-option value="3">
                {{ $t('config.saveOption.saveToFilenameFolder') }}
              </a-select-option>
              <a-select-option value="4">
                {{ $t('config.saveOption.saveTorelativePath') }}
              </a-select-option>
              <a-select-option value="5">
                {{ $t('config.saveOption.uploadToPictureBed') }}
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item v-if="showImgAbsolutePath" :label="$t('config.picture.absolutePath')">
            <a-input
              v-model:value="config.imgAbsolutePath"
              readonly
            >
              <template #addonAfter>
                <div class="i-tabler:folder cursor-pointer" @click="openDirSelect" />
              </template>
            </a-input>
          </a-descriptions-item>
          <a-descriptions-item v-if="showImgRelativePath" :label="$t('config.picture.relativePath')">
            <a-input v-model:value="config.imgRelativePath" />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="imageBed">{{ $t('config.title.pictureBed') }}</span>
          </template>
          <a-descriptions-item :label="$t('config.pictureBed.pictureBed')">
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
          <a-descriptions-item v-if="config.imageBed.uploader === 'smms'" label="Token">
            <a-input-password v-model:value="config.imageBed.smms.token" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.imageBed.uploader === 'smms'" :label="$t('config.pictureBed.customDomain')">
            <a-input v-model:value="config.imageBed.smms.backupDomain" />
          </a-descriptions-item>

          <!-- github -->
          <a-descriptions-item v-if="config.imageBed.uploader === 'github'" :label="$t('config.pictureBed.repository')">
            <a-input v-model:value="config.imageBed.github.repo" placeholder="owner/repo" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.imageBed.uploader === 'github'" label="Token">
            <a-input-password v-model:value="config.imageBed.github.token" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.imageBed.uploader === 'github'" :label="$t('config.pictureBed.storagePath')">
            <a-input v-model:value="config.imageBed.github.path" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.imageBed.uploader === 'github'" :label="$t('config.pictureBed.branch')">
            <a-input v-model:value="config.imageBed.github.branch" placeholder="main" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.imageBed.uploader === 'github'" :label="$t('config.pictureBed.customDomain')">
            <a-input v-model:value="config.imageBed.github.customUrl" />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="shortcut">{{ $t('config.title.shortcut') }}</span>
          </template>
          <a-descriptions-item v-for="item in config.shortcutKeyList" :key="item.id" :label="$t(`shortcutKey.${item.id}`)">
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
            <span id="watermark">{{ $t('config.title.watermark') }}</span>
          </template>
          <a-descriptions-item :label="$t('config.watermark.watermark')">
            <a-radio-group v-model:value="config.watermark.enabled" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.enable') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.disable') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.previewWatermark')">
            <a-radio-group v-model:value="config.watermark.previewEnabled" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.enable') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.disable') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.watermarkTime')">
            <a-radio-group v-model:value="config.watermark.dateEnabled" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.enable') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.disable') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.timeFormat')">
            <a-select v-model:value="config.watermark.datePattern" class="w-full">
              <a-select-option value="YYYY-MM-DD">
                YYYY-MM-DD
              </a-select-option>
              <a-select-option value="YYYY-MM-DD HH:mm:ss">
                YYYY-MM-DD HH:mm:ss
              </a-select-option>
            </a-select>
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.content')">
            <a-input v-model:value="config.watermark.content" />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.angle')">
            <a-slider
              v-model:value="config.watermark.rotate"
              :min="-180"
              :max="180"
            />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.intervalWidth')">
            <a-slider
              v-model:value="config.watermark.gap[0]"
              :min="10"
              :max="500"
            />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.intervalHeight')">
            <a-slider
              v-model:value="config.watermark.gap[1]"
              :min="10"
              :max="500"
            />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.fontSize')">
            <a-slider
              v-model:value="config.watermark.font.fontSize"
              :min="12"
              :max="100"
            />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.fontWeight')">
            <a-slider
              v-model:value="config.watermark.font.fontWeight"
              :min="200"
              :max="1000"
            />
          </a-descriptions-item>
          <a-descriptions-item v-if="config.watermark.enabled" :label="$t('config.watermark.fontColor')">
            <ColorPicker v-model:pure-color="config.watermark.font.color" format="rgb" shape="square" picker-type="chrome" />
          </a-descriptions-item>
        </a-descriptions>
        <a-descriptions bordered :column="1" size="small">
          <template #title>
            <span id="export">{{ $t('config.title.export') }}</span>
          </template>
          <a-descriptions-item :label="$t('config.export.pdfPageNumber')">
            <a-radio-group v-model:value="config.export.pdf.footer.pageNumber" button-style="solid">
              <a-radio-button :value="true">
                {{ $t('config.yes') }}
              </a-radio-button>
              <a-radio-button :value="false">
                {{ $t('config.no') }}
              </a-radio-button>
            </a-radio-group>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.export.pdfFooter')">
            <a-textarea
              v-model:value="config.export.pdf.footer.content"
              spellcheck="false"
              placeholder="Support HTML tags"
              auto-size
            />
          </a-descriptions-item>
          <a-descriptions-item :label="$t('config.export.pdfHeader')">
            <a-textarea
              v-model:value="config.export.pdf.header.content"
              spellcheck="false"
              placeholder="Support HTML tags"
              auto-size
            />
          </a-descriptions-item>
        </a-descriptions>
      </div>
      <div class="w-25">
        <a-affix :key="anchorKey" :offset-top="50" style="width: fit-content;">
          <a-anchor
            :affix="false"
            :wrapper-style="{ width: 'fit-content' }"
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
  min-width: 80px;
  text-align: center;
}
:deep(.ant-descriptions-title) {
  padding-top: 20px;
  user-select: none;
  span {
    display: inline-block;
  }
}
:deep(.ant-descriptions-item-label) {
  user-select: none;
}
</style>
