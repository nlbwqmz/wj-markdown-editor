import Split from 'split-grid'

export const FILE_MANAGER_PANEL_DEFAULT_WIDTH = 260
export const FILE_MANAGER_PANEL_MIN_WIDTH = 200
export const FILE_MANAGER_PANEL_MAX_WIDTH = 420

/**
 * 将文件管理栏宽度限制在允许范围内，避免拖拽结果超出壳层设计边界。
 *
 * @param {number} width
 * @returns {number} 返回经过最小值和最大值钳制后的宽度。
 */
export function clampFileManagerPanelWidth(width) {
  const normalizedWidth = Number(width)
  const nextWidth = Number.isFinite(normalizedWidth) ? normalizedWidth : FILE_MANAGER_PANEL_DEFAULT_WIDTH

  return Math.min(FILE_MANAGER_PANEL_MAX_WIDTH, Math.max(FILE_MANAGER_PANEL_MIN_WIDTH, nextWidth))
}

/**
 * 生成文件管理栏展开态的 grid 列定义。
 *
 * @param {number} width
 * @returns {string} 返回可直接写入 grid-template-columns 的列定义。
 */
export function resolveHomeViewFilePanelGridTemplateColumns(width) {
  return `${clampFileManagerPanelWidth(width)}px 1px 1fr`
}

/**
 * 为 HomeView 外层文件管理栏壳层管理 split-grid 生命周期。
 *
 * @param {{
 *   hostRef: { value?: HTMLElement | null },
 *   gutterRef: { value?: HTMLElement | null },
 *   panelWidthRef: { value: number },
 *   nextTick: () => Promise<void>,
 *   createSplitInstance?: (options: object) => { destroy?: (preserveStyles?: boolean) => void } | null,
 *   readComputedStyle?: (element: HTMLElement) => CSSStyleDeclaration | { gridTemplateColumns?: string },
 * }} options
 */
export function createHomeViewFilePanelLayoutController({
  hostRef,
  gutterRef,
  panelWidthRef,
  nextTick,
  createSplitInstance = options => Split(options),
  readComputedStyle = element => window.getComputedStyle(element),
}) {
  let splitInstance = null

  function applyPanelWidth() {
    if (!hostRef.value) {
      return
    }

    hostRef.value.style.gridTemplateColumns = resolveHomeViewFilePanelGridTemplateColumns(panelWidthRef.value)
  }

  function readCurrentPanelWidth() {
    if (!hostRef.value) {
      return clampFileManagerPanelWidth(panelWidthRef.value)
    }

    const computedGridTemplateColumns = readComputedStyle(hostRef.value)?.gridTemplateColumns ?? ''
    const currentPanelWidth = Number.parseFloat(computedGridTemplateColumns.split(' ')[0] ?? '')

    if (Number.isFinite(currentPanelWidth) === false) {
      return clampFileManagerPanelWidth(panelWidthRef.value)
    }

    return clampFileManagerPanelWidth(currentPanelWidth)
  }

  function destroySplitLayout() {
    splitInstance?.destroy?.(true)
    splitInstance = null
  }

  function createSplit() {
    if (!hostRef.value || !gutterRef.value) {
      return null
    }

    applyPanelWidth()
    splitInstance = createSplitInstance({
      columnGutters: [{ track: 1, element: gutterRef.value }],
      minSize: FILE_MANAGER_PANEL_MIN_WIDTH,
      snapOffset: 0,
      onDrag() {
        panelWidthRef.value = readCurrentPanelWidth()
        applyPanelWidth()
      },
    })

    return splitInstance
  }

  async function rebuildSplitLayout(visible) {
    destroySplitLayout()

    if (!visible) {
      return null
    }

    await nextTick()
    return createSplit()
  }

  return {
    applyPanelWidth,
    readCurrentPanelWidth,
    destroySplitLayout,
    rebuildSplitLayout,
  }
}
