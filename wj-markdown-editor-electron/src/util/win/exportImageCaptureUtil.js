function normalizeCaptureHeight(contentHeight) {
  const numericHeight = Number(contentHeight)
  if (!Number.isFinite(numericHeight)) {
    return 1
  }
  return Math.max(1, Math.ceil(numericHeight))
}

async function defaultWaitForLayout() {
  await new Promise(resolve => setTimeout(resolve, 500))
}

/**
 * 从隐藏导出窗口中抓取图片缓冲区。
 *
 * 这里必须显式使用 `stayHidden: true`，
 * 否则 Electron 会把隐藏页切到可见捕获态，
 * 导致窗口闪烁甚至拿到空白截图。
 *
 * @param {{
 *   win: Pick<Electron.BrowserWindow, 'getSize' | 'setSize' | 'capturePage'>,
 *   type: 'PNG' | 'JPEG',
 *   contentHeight: number,
 *   waitForLayout?: () => Promise<void>,
 * }} options
 * @returns {Promise<Buffer>} 返回导出的图片二进制内容
 */
export async function captureExportImageBuffer(options) {
  const {
    win,
    type,
    contentHeight,
    waitForLayout = defaultWaitForLayout,
  } = options

  const targetHeight = normalizeCaptureHeight(contentHeight)
  const [currentWidth] = win.getSize()
  win.setSize(currentWidth, targetHeight)

  await waitForLayout()

  const image = await win.capturePage(undefined, { stayHidden: true })
  return type === 'PNG' ? image.toPNG() : image.toJPEG(100)
}

export default {
  captureExportImageBuffer,
}
