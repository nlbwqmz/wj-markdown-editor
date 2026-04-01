import { nextTick } from 'vue'
import { waitForImagesSettled as defaultWaitForImagesSettled } from './exportImageLoadUtil.js'

/**
 * 默认加载代码主题。
 * 这里使用惰性导入，避免 node:test 直接加载该文件时被 Vite 路径别名卡住。
 *
 * @param {string} themeName
 * @returns {Promise<void>}
 */
async function defaultLoadCodeTheme(themeName) {
  const { loadCodeTheme } = await import('./codeThemeUtil.js')
  await loadCodeTheme(themeName)
}

/**
 * 等待下一次动画帧，给浏览器一个完成样式计算与布局刷新的机会。
 *
 * @returns {Promise<void>}
 */
function waitNextAnimationFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        resolve()
      })
      return
    }

    setTimeout(() => {
      resolve()
    }, 16)
  })
}

/**
 * 默认等待字体资源进入可用态。
 * 某些导出环境可能没有 FontFaceSet，此时必须立即放行，避免无意义阻塞。
 *
 * @returns {Promise<void>}
 */
function waitForDocumentFontsReady() {
  if (typeof document === 'undefined') {
    return Promise.resolve()
  }

  return document.fonts?.ready ?? Promise.resolve()
}

/**
 * 等待导出前的关键渲染依赖全部稳定。
 * 这里显式把代码主题、Vue DOM patch、两帧布局稳定、字体与图片都串到同一条等待链上，
 * 避免导出时拿到尚未应用完代码主题的页面。
 *
 * @param {{
 *   themeName?: string,
 *   images?: ArrayLike<EventTarget> | null,
 *   loadCodeTheme?: (themeName: string) => Promise<void>,
 *   waitForNextTick?: () => Promise<void>,
 *   waitForAnimationFrame?: () => Promise<void>,
 *   waitForFontsReady?: () => Promise<void>,
 *   waitForImagesSettled?: (images: ArrayLike<EventTarget> | null | undefined) => Promise<void>,
 * }} options
 * @returns {Promise<void>}
 */
export async function waitForExportRenderSettled(options = {}) {
  const {
    themeName = '',
    images = [],
    loadCodeTheme = defaultLoadCodeTheme,
    waitForNextTick = nextTick,
    waitForAnimationFrame = waitNextAnimationFrame,
    waitForFontsReady = waitForDocumentFontsReady,
    waitForImagesSettled = defaultWaitForImagesSettled,
  } = options

  if (themeName) {
    await loadCodeTheme(themeName)
  }

  await waitForNextTick()
  await waitForAnimationFrame()
  await waitForAnimationFrame()
  await waitForFontsReady()
  await waitForImagesSettled(images)
}

export default {
  waitForExportRenderSettled,
}
