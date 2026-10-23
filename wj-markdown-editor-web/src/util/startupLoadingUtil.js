import { nextTick } from 'vue'

/**
 * 首屏内容就绪事件名。
 * index.html 中注入的启动遮罩监听该事件，收到后在首屏内容可看时淡出并移除遮罩。
 */
export const STARTUP_LOADING_READY_EVENT = 'wj-first-screen-ready'

/**
 * 启动遮罩已移除事件名。
 *
 * 遮罩有三条移除路径：首屏就绪事件、App 的 15s 兜底、index.html 对
 * searchBar/export 路由的直接移除。App 在真正移除后派发该事件，
 * 供“必须等遮罩消失后再出现”的启动期 UI（例如启动跳过提示）监听。
 */
export const STARTUP_LOADING_DISMISSED_EVENT = 'wj-startup-loading-dismissed'

/**
 * 当前窗口是否已完成首屏内容就绪。
 * 供启动期需要延迟执行的渲染任务查询，例如把水印绘制推迟到首屏内容可看之后。
 */
let firstScreenReady = false

/**
 * 查询首屏内容是否已经就绪。
 * 该状态为模块级单例，同一窗口内所有视图共享；重复调用无害。
 *
 * @returns {boolean} 首屏内容是否已经就绪
 */
export function isFirstScreenReady() {
  return firstScreenReady
}

/**
 * 通知启动遮罩：当前视图首屏内容已经可看。
 * 在 nextTick 与下一帧动画之后派发事件，确保浏览器已完成首屏内容布局，
 * 避免遮罩先于内容消失导致白屏闪烁。
 * 供各视图在“首屏内容可看”时调用，重复调用无害。
 *
 * @returns {void}
 */
export function notifyFirstScreenReady() {
  nextTick(() => {
    requestAnimationFrame(() => {
      firstScreenReady = true
      window.dispatchEvent(new CustomEvent(STARTUP_LOADING_READY_EVENT))
    })
  })
}

/**
 * 等启动遮罩真正移除。
 *
 * 判断顺序：
 * 1. 遮罩节点已不在（未渲染、已被直接移除、或移除后才调用）→ 立即完成
 * 2. 否则监听 `STARTUP_LOADING_DISMISSED_EVENT`
 * 3. 超时兜底：遮罩因异常一直不撤时，也不能让等待方永远挂起
 *
 * @param {{ timeoutMs?: number }} [options] 超时配置，默认 3000ms
 * @returns {Promise<void>}
 */
export function waitForStartupLoadingDismissed({ timeoutMs = 3000 } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve()
  }
  if (!document.getElementById('startup-loading')) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let settled = false
    let timer = null

    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      if (timer) {
        clearTimeout(timer)
      }
      window.removeEventListener(STARTUP_LOADING_DISMISSED_EVENT, finish)
      resolve()
    }

    window.addEventListener(STARTUP_LOADING_DISMISSED_EVENT, finish, { once: true })
    timer = setTimeout(finish, timeoutMs)
  })
}

export default {
  STARTUP_LOADING_READY_EVENT,
  STARTUP_LOADING_DISMISSED_EVENT,
  notifyFirstScreenReady,
  isFirstScreenReady,
  waitForStartupLoadingDismissed,
}
