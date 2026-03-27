const GUTTER_ITEM_TYPE_BY_PANEL_PAIR = new Map([
  ['editor:preview', 'gutter-preview'],
  ['preview:editor', 'gutter-preview'],
  ['preview:menu', 'gutter-menu'],
  ['menu:preview', 'gutter-menu'],
])

/**
 * 把布局 helper 给出的面板顺序转换成模板可直接消费的渲染项顺序。
 * 除了 editor / preview / menu 面板本身，还会在相邻面板之间插入对应 gutter。
 *
 * @param {{ columnOrder?: string[] } | undefined} layoutMode
 * @returns {Array<{ key: string, type: string }>} 返回带稳定 key 的布局渲染项数组。
 */
export function resolveMarkdownEditRenderItems(layoutMode = {}) {
  const columnOrder = Array.isArray(layoutMode.columnOrder) ? layoutMode.columnOrder : []
  const renderItems = []

  for (let index = 0; index < columnOrder.length; index++) {
    const currentPanel = columnOrder[index]
    const nextPanel = columnOrder[index + 1]

    renderItems.push({
      key: currentPanel,
      type: currentPanel,
    })

    const gutterItemType = GUTTER_ITEM_TYPE_BY_PANEL_PAIR.get(`${currentPanel}:${nextPanel}`)
    if (!gutterItemType) {
      continue
    }

    renderItems.push({
      key: gutterItemType,
      type: gutterItemType,
    })
  }

  return renderItems
}
