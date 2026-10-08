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
 * 统一解析 grid-template-columns。
 * 同时保留原始 token 文本与解析后的数值/单位，便于调用方按需“读值”或“替换轨道”。
 *
 * @param {string} gridTemplateColumns
 * @returns {{ tokenList: string[], trackList: Array<{ value: number, unit: string }> } | null} 返回解析结果；无法解析时返回 null。
 */
function resolveGridTrackDescriptor(gridTemplateColumns) {
  const tokenList = typeof gridTemplateColumns === 'string'
    ? gridTemplateColumns.trim().split(/\s+/u).filter(Boolean)
    : []

  if (tokenList.length === 0) {
    return null
  }

  const trackList = tokenList.map(parseGridTrackToken)
  if (trackList.includes(null)) {
    return null
  }

  return {
    tokenList,
    trackList,
  }
}

/**
 * 读取 grid-template-columns 中第 index 个轨道的数值。
 * 只返回数值本身，是否需要按业务语义处理单位由调用方决定。
 *
 * @param {string} gridTemplateColumns
 * @param {number} index
 * @returns {number | null} 返回轨道数值；解析失败或下标越界时返回 null。
 */
export function readGridTrackValue(gridTemplateColumns, index) {
  const descriptor = resolveGridTrackDescriptor(gridTemplateColumns)
  if (!descriptor || Number.isInteger(index) !== true || index < 0 || index >= descriptor.trackList.length) {
    return null
  }

  return descriptor.trackList[index].value
}

/**
 * 把 grid-template-columns 中第 index 个轨道替换为 `${value}${unit}`。
 * 其余轨道保留原始 token 文本，避免无谓改写调用方已有的列定义。
 *
 * @param {string} gridTemplateColumns
 * @param {number} index
 * @param {number} value
 * @param {string} [unit]
 * @returns {string} 返回替换后的列模板；解析失败或参数非法时返回空串。
 */
export function replaceGridTrackValue(gridTemplateColumns, index, value, unit = 'px') {
  const descriptor = resolveGridTrackDescriptor(gridTemplateColumns)
  if (!descriptor || Number.isInteger(index) !== true || index < 0 || index >= descriptor.trackList.length) {
    return ''
  }

  if (Number.isFinite(value) !== true || typeof unit !== 'string' || unit === '') {
    return ''
  }

  return descriptor.tokenList
    .map((token, trackIndex) => (trackIndex === index ? `${formatGridTrackValue(value)}${unit}` : token))
    .join(' ')
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

/**
 * 把 grid-template-columns 归一化成自适应列模板，并让指定轨道保持固定像素宽度。
 * 与 resolveAdaptiveGridTemplateColumns 的关键差异是归一化分母：这里排除固定轨道，
 * 保证其余内容列的 fr 之和仍为 1。
 * 若继续用“全部内容列”作分母，把某一列改成固定像素后 fr 之和会小于 1，
 * CSS 会把小于 1 的 fr 总和按 1 处理，剩余空间不再参与分配，页面上会留出空白区域。
 *
 * @param {string} gridTemplateColumns
 * @param {number} fixedTrackIndex
 * @param {number} fixedTrackValue
 * @param {string} [unit]
 * @returns {string} 返回替换后的列模板；无法安全归一化时返回空串。
 */
export function resolveAdaptiveGridTemplateColumnsWithFixedTrack(gridTemplateColumns, fixedTrackIndex, fixedTrackValue, unit = 'px') {
  const descriptor = resolveGridTrackDescriptor(gridTemplateColumns)
  if (!descriptor) {
    return ''
  }

  if (Number.isInteger(fixedTrackIndex) !== true || fixedTrackIndex < 0 || fixedTrackIndex >= descriptor.trackList.length) {
    return ''
  }

  if (Number.isFinite(fixedTrackValue) !== true || typeof unit !== 'string' || unit === '') {
    return ''
  }

  const panelTrackList = descriptor.trackList.filter((_track, index) => index % 2 === 0 && index !== fixedTrackIndex)
  if (panelTrackList.some(track => track.unit !== 'px')) {
    return ''
  }

  const totalPanelWidth = panelTrackList.reduce((sum, track) => sum + Math.max(track.value, 0), 0)
  if (totalPanelWidth <= 0) {
    return ''
  }

  return descriptor.trackList.map((track, index) => {
    if (index === fixedTrackIndex) {
      return `${formatGridTrackValue(fixedTrackValue)}${unit}`
    }

    if (index % 2 === 1) {
      return `${formatGridTrackValue(track.value)}${track.unit}`
    }

    if (track.value <= 0) {
      return '0fr'
    }

    return `${formatGridTrackValue(track.value / totalPanelWidth)}fr`
  }).join(' ')
}
