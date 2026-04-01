import assert from 'node:assert/strict'

const { test } = await import('node:test')

let exportRenderReadyUtilModule = null

try {
  exportRenderReadyUtilModule = await import('../exportRenderReadyUtil.js')
} catch {
  exportRenderReadyUtilModule = null
}

function requireWaitForExportRenderSettled() {
  assert.ok(exportRenderReadyUtilModule, '缺少 export render ready util')

  const { waitForExportRenderSettled } = exportRenderReadyUtilModule
  assert.equal(typeof waitForExportRenderSettled, 'function')

  return waitForExportRenderSettled
}

test('代码主题未完成加载前不应继续进入布局与图片等待阶段', async () => {
  const waitForExportRenderSettled = requireWaitForExportRenderSettled()
  const phaseList = []
  let resolveThemeLoad

  const waitingPromise = waitForExportRenderSettled({
    themeName: 'atom-one-dark',
    images: [],
    loadCodeTheme: () => new Promise((resolve) => {
      resolveThemeLoad = () => {
        phaseList.push('theme')
        resolve()
      }
    }),
    waitForNextTick: async () => {
      phaseList.push('nextTick')
    },
    waitForAnimationFrame: async () => {
      phaseList.push('animationFrame')
    },
    waitForFontsReady: async () => {
      phaseList.push('fonts')
    },
    waitForImagesSettled: async () => {
      phaseList.push('images')
    },
  })

  await Promise.resolve()
  assert.deepEqual(phaseList, [])

  resolveThemeLoad()
  await waitingPromise

  assert.deepEqual(phaseList, ['theme', 'nextTick', 'animationFrame', 'animationFrame', 'fonts', 'images'])
})

test('未提供代码主题时仍应等待布局、字体与图片稳定', async () => {
  const waitForExportRenderSettled = requireWaitForExportRenderSettled()
  const phaseList = []

  await waitForExportRenderSettled({
    themeName: '',
    images: ['demo-image'],
    loadCodeTheme: async () => {
      phaseList.push('theme')
    },
    waitForNextTick: async () => {
      phaseList.push('nextTick')
    },
    waitForAnimationFrame: async () => {
      phaseList.push('animationFrame')
    },
    waitForFontsReady: async () => {
      phaseList.push('fonts')
    },
    waitForImagesSettled: async (images) => {
      phaseList.push(`images:${images.length}`)
    },
  })

  assert.deepEqual(phaseList, ['nextTick', 'animationFrame', 'animationFrame', 'fonts', 'images:1'])
})
