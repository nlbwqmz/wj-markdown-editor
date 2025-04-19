import { message } from 'ant-design-vue'
import { nanoid } from 'nanoid'
import { h } from 'vue'

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

export default {
  createId,
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
      h('div', { style: { paddingLeft: '20px', color: 'rgb(199,199,199)' } }, shortcuts),
    ])
  },
  debounce,
}
