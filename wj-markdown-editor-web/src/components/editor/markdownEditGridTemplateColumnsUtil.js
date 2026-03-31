const GRID_TRACK_TOKEN_PATTERN = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|fr|%)$/u

/**
 * 将 CSS Grid 轨道数值格式化为紧凑字符串，避免输出冗长小数。
 *
 * @param {number} value
 * @returns {string} 返回适合拼接 CSS 的紧凑数值字符串。
 */
function formatGridTrackValue(value) {
  if (Number.isFinite(value) !== true) {
    return '0'
  }

  return Number.parseFloat(value.toFixed(6)).toString()
}

/**
 * 解析 grid-template-columns 的单个轨道 token。
 *
 * @param {string} token
 * @returns {{ value: number, unit: string } | null} 返回解析结果；不支持时返回 null。
 */
function parseGridTrackToken(token) {
  const matched = typeof token === 'string'
    ? token.trim().match(GRID_TRACK_TOKEN_PATTERN)
    : null

  if (!matched) {
    return null
  }

  const value = Number(matched[1])
  if (Number.isFinite(value) !== true) {
    return null
  }

  return {
    value,
    unit: matched[2],
  }
}

/**
 * 把拖拽后的像素列宽重新归一化成可随容器伸缩的 fr 轨道。
 * MarkdownEdit 的列模板始终遵循“内容列 / gutter / 内容列 ...”顺序，
 * 因此这里把偶数位内容列换算成比例，奇数位 gutter 继续保留 px。
 *
 * @param {string} gridTemplateColumns
 * @returns {string} 返回自适应列模板；无法安全归一化时返回空串。
 */
export function resolveAdaptiveGridTemplateColumns(gridTemplateColumns) {
  const trackTokenList = typeof gridTemplateColumns === 'string'
    ? gridTemplateColumns.trim().split(/\s+/u).filter(Boolean)
    : []

  if (trackTokenList.length === 0) {
    return ''
  }

  const trackList = trackTokenList.map(parseGridTrackToken)
  if (trackList.includes(null)) {
    return ''
  }

  const panelTrackList = trackList.filter((_track, index) => index % 2 === 0)
  if (panelTrackList.some(track => track.unit !== 'px')) {
    return ''
  }

  const totalPanelWidth = panelTrackList.reduce((sum, track) => sum + Math.max(track.value, 0), 0)
  if (totalPanelWidth <= 0) {
    return ''
  }

  return trackList.map((track, index) => {
    if (index % 2 === 1) {
      return `${formatGridTrackValue(track.value)}${track.unit}`
    }

    if (track.value <= 0) {
      return '0fr'
    }

    return `${formatGridTrackValue(track.value / totalPanelWidth)}fr`
  }).join(' ')
}
