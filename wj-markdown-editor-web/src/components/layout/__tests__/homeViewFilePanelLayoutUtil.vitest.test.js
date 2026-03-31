import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import {
  clampFileManagerPanelWidth,
  createHomeViewFilePanelLayoutController,
  FILE_MANAGER_PANEL_DEFAULT_WIDTH,
  FILE_MANAGER_PANEL_MAX_WIDTH,
  FILE_MANAGER_PANEL_MIN_WIDTH,
  resolveHomeViewFilePanelGridTemplateColumns,
} from '../homeViewFilePanelLayoutUtil.js'

const homeViewFilePanelLayoutState = vi.hoisted(() => ({
  splitCalls: [],
  splitDestroySpies: [],
}))

vi.mock('split-grid', () => ({
  default(options) {
    const destroy = vi.fn()
    homeViewFilePanelLayoutState.splitCalls.push(options)
    homeViewFilePanelLayoutState.splitDestroySpies.push(destroy)
    return {
      destroy,
    }
  },
}))

function createHostElement() {
  const hostElement = document.createElement('div')
  hostElement.style.gridTemplateColumns = `${FILE_MANAGER_PANEL_DEFAULT_WIDTH}px 2px 1fr`
  document.body.appendChild(hostElement)
  return hostElement
}

function createGutterElement() {
  const gutterElement = document.createElement('div')
  document.body.appendChild(gutterElement)
  return gutterElement
}

describe('homeViewFilePanelLayoutUtil', () => {
  beforeEach(() => {
    homeViewFilePanelLayoutState.splitCalls.length = 0
    homeViewFilePanelLayoutState.splitDestroySpies.length = 0
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('文件管理栏默认宽度和边界值必须保持稳定', () => {
    expect(FILE_MANAGER_PANEL_DEFAULT_WIDTH).toBe(260)
    expect(FILE_MANAGER_PANEL_MIN_WIDTH).toBe(200)
    expect(FILE_MANAGER_PANEL_MAX_WIDTH).toBe(420)
  })

  it('拖动文件管理栏时应把宽度限制在 200 到 420 之间', () => {
    expect(clampFileManagerPanelWidth(120)).toBe(200)
    expect(clampFileManagerPanelWidth(520)).toBe(420)
  })

  it('文件管理栏展开态的 grid 列定义应使用 1px gutter 轨道', () => {
    expect(resolveHomeViewFilePanelGridTemplateColumns(FILE_MANAGER_PANEL_DEFAULT_WIDTH)).toBe('260px 1px 1fr')
  })

  it('拖拽回调会按当前轨道宽度钳制 panel 宽度', async () => {
    const panelWidthRef = ref(FILE_MANAGER_PANEL_DEFAULT_WIDTH)
    const controller = createHomeViewFilePanelLayoutController({
      hostRef: ref(createHostElement()),
      gutterRef: ref(createGutterElement()),
      panelWidthRef,
      nextTick,
      readComputedStyle: () => ({
        gridTemplateColumns: '520px 1px 1fr',
      }),
    })

    await controller.rebuildSplitLayout(true)
    homeViewFilePanelLayoutState.splitCalls[0].onDrag()

    expect(panelWidthRef.value).toBe(FILE_MANAGER_PANEL_MAX_WIDTH)
  })

  it('文件管理栏关闭再打开后应重建 split-grid，拖拽能力继续可用', async () => {
    const controller = createHomeViewFilePanelLayoutController({
      hostRef: ref(createHostElement()),
      gutterRef: ref(createGutterElement()),
      panelWidthRef: ref(FILE_MANAGER_PANEL_DEFAULT_WIDTH),
      nextTick,
    })

    await controller.rebuildSplitLayout(true)
    await controller.rebuildSplitLayout(false)
    await controller.rebuildSplitLayout(true)

    expect(homeViewFilePanelLayoutState.splitCalls).toHaveLength(2)
    expect(homeViewFilePanelLayoutState.splitDestroySpies[0]).toHaveBeenCalledWith(true)
  })
})
