import { nextTick } from 'vue'

/**
 * 首屏内容就绪事件名。
 * index.html 中注入的启动遮罩监听该事件，收到后在首屏内容可看时淡出并移除遮罩。
 */
export const STARTUP_LOADING_READY_EVENT = 'wj-first-screen-ready'

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

export default {
  STARTUP_LOADING_READY_EVENT,
  notifyFirstScreenReady,
  isFirstScreenReady,
}
