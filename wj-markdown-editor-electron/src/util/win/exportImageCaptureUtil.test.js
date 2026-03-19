import { describe, expect, it, vi } from 'vitest'

let exportImageCaptureUtilModule = null

try {
  exportImageCaptureUtilModule = await import('./exportImageCaptureUtil.js')
} catch {
  exportImageCaptureUtilModule = null
}

function requireCaptureExportImageBuffer() {
  expect(exportImageCaptureUtilModule, '缺少 export image capture util').toBeTruthy()

  const { captureExportImageBuffer } = exportImageCaptureUtilModule
  expect(typeof captureExportImageBuffer).toBe('function')

  return captureExportImageBuffer
}

function createMockExportWindow() {
  const pngBuffer = Buffer.from('png-buffer')
  const jpegBuffer = Buffer.from('jpeg-buffer')
  const capturePage = vi.fn(async () => ({
    toPNG: () => pngBuffer,
    toJPEG: () => jpegBuffer,
  }))
  const setSize = vi.fn()
  const getSize = vi.fn(() => [794, 600])

  return {
    pngBuffer,
    jpegBuffer,
    win: {
      capturePage,
      setSize,
      getSize,
    },
    capturePage,
    setSize,
    getSize,
  }
}

describe('captureExportImageBuffer', () => {
  it('隐藏导出窗口截图时必须显式保持 stayHidden，避免截图过程闪烁', async () => {
    const captureExportImageBuffer = requireCaptureExportImageBuffer()
    const { win, capturePage, setSize, pngBuffer } = createMockExportWindow()

    const buffer = await captureExportImageBuffer({
      win,
      type: 'PNG',
      contentHeight: 1080,
      waitForLayout: async () => {},
    })

    expect(setSize).toHaveBeenCalledWith(794, 1080)
    expect(capturePage).toHaveBeenCalledWith(undefined, { stayHidden: true })
    expect(buffer).toEqual(pngBuffer)
  })

  it('截图高度非法时也必须回退到安全值，避免传入 0 导致空白截图', async () => {
    const captureExportImageBuffer = requireCaptureExportImageBuffer()
    const { win, setSize, jpegBuffer } = createMockExportWindow()

    const buffer = await captureExportImageBuffer({
      win,
      type: 'JPEG',
      contentHeight: 0,
      waitForLayout: async () => {},
    })

    expect(setSize).toHaveBeenCalledWith(794, 1)
    expect(buffer).toEqual(jpegBuffer)
  })
})
