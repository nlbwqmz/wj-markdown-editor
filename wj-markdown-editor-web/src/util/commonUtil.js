import router from '@/router/index.js'
import channelUtil from '@/util/channel/channelUtil.js'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { message, Modal, Tooltip } from 'ant-design-vue'
import { nanoid } from 'nanoid'
import { createVNode, h } from 'vue'

const createId = () => `wj${nanoid()}`

/**
 * 防抖函数
 * @param {Function} func - 需要防抖的目标函数
 * @param {number} wait - 防抖延迟时间（毫秒）
 * @param {boolean} [immediate] - 是否立即执行（true 表示首次触发立即执行）
 * @return {Function} 返回经过防抖处理的函数
 */
function debounce(func, wait, immediate = false) {
  let timeout

  // 返回处理后的防抖函数
  return function executedFunction(...args) {
    const context = this // 保存当前执行上下文

    // 清理之前的定时器
    const later = () => {
      timeout = null
      // 非立即执行模式下调用目标函数
      if (!immediate)
        func.apply(context, args)
    }

    // 判断是否应该立即执行
    const callNow = immediate && !timeout

    clearTimeout(timeout) // 每次调用都重置定时器
    timeout = setTimeout(later, wait) // 设置新的定时器

    // 立即执行模式且无等待中任务时，立即调用
    if (callNow)
      func.apply(context, args)
  }
}

function getUrlParam(name) {
  if (router.currentRoute.value.query[name]) {
    return router.currentRoute.value.query[name]
  }
  const searchParams = new URL(window.location.href).searchParams
  return searchParams.get(name)
}

function stringToHex(str) {
  let hex = ''
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i)
    const hexValue = charCode.toString(16)
    // 确保每个字符是两位十六进制表示
    hex += hexValue.padStart(2, '0')
  }
  return hex
}

function upperCaseFirst(str) {
  if (!str) {
    return ''
  } else if (str.length === 1) {
    return str.toUpperCase()
  }
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function strToBase64(str) {
  const bytes = new TextEncoder().encode(str)
  const binString = String.fromCodePoint(...bytes)
  return btoa(binString)
}

function base64ToStr(base64) {
  const binString = atob(base64)
  const bytes = Uint8Array.from(binString, m => m.codePointAt(0))
  return new TextDecoder().decode(bytes)
}
export default {
  strToBase64,
  base64ToStr,
  stringToHex,
  createId,
  getUrlParam,
  initCopyCode: () => {
    window.copyCode = (code) => {
      if (!code) {
        message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(base64ToStr(code)).then(() => {
        message.success('复制成功')
      }).catch(() => {
        message.error('复制失败')
      })
    }
  },
  initMessageConfig: () => {
    message.config({
      top: '150px',
      duration: 3,
      maxCount: 3,
      rtl: true,
    })
  },
  createLabel: (label, shortcuts) => {
    return h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, [
      h('div', {}, label),
      h('div', { style: { paddingLeft: '20px', color: 'rgb(160,160,160)' } }, shortcuts),
    ])
  },
  createRecentLabel: (path, name) => {
    return h(Tooltip, { placement: 'right', color: '#1677ff', title: path }, () => h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      h('div', {}, name),
      h('div', {
        style: { marginLeft: '20px', color: 'rgb(160,160,160)' },
        class: ['i-tabler:x'],
        onMouseenter: (e) => { e.target.style.color = 'black' },
        onMouseleave: (e) => { e.target.style.color = 'rgb(160,160,160)' },
        onClick: (e) => {
          e.preventDefault()
          e.stopPropagation()
          Modal.confirm({
            title: '提示',
            icon: createVNode(ExclamationCircleOutlined),
            content: `确认移除当前历史记录（${name}）？`,
            okText: '确认',
            cancelText: '取消',
            onOk: () => {
              channelUtil.send({ event: 'recent-remove', data: path }).then(() => {})
            },
          })
        },
      }),
    ]))
  },
  debounce,
  upperCaseFirst,
  recentFileNotExists: (filePath) => {
    Modal.confirm({
      title: '提示',
      icon: createVNode(ExclamationCircleOutlined),
      content: `文件(${filePath})不存在，是否移除历史记录？`,
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        channelUtil.send({ event: 'recent-remove', data: filePath }).then(() => {})
      },
    })
  },
}
