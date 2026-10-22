/**
 * 设置项搜索的纯函数集合：归一化、分词、匹配、排序与高亮区间。
 * 所有函数不依赖 DOM 与 i18n 实例，便于单元测试。
 */

// 匹配权重：完全相等 / 前缀 / 包含。
const LABEL_WEIGHT = { exact: 120, prefix: 100, contains: 80 }
const LABEL_ALT_WEIGHT = { exact: 108, prefix: 90, contains: 72 }
const KEYWORD_WEIGHT = { exact: 70, prefix: 60, contains: 50 }
const KEYMAP_WEIGHT = { exact: 60, prefix: 55, contains: 45 }
// 整串 query 与 label 完全一致（含去空格后一致）时的额外加分。
const WHOLE_QUERY_BONUS = 40
// 分组名 / tab 名完全相等展开时的基础分。
const SECTION_EXPAND_BONUS = 20
const TAB_EXPAND_BONUS = 15
const MAX_TOKEN_COUNT = 5
const MAX_TOKEN_LENGTH = 64

/**
 * 归一化搜索文本：NFKC 统一全角半角、转小写、折叠空白。
 *
 * @param {unknown} value 原始文本。
 * @returns {string} 归一化结果。
 */
function normalizeSettingSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 把搜索输入切成 token 列表。中文不分词，空格作为唯一分隔符。
 *
 * @param {unknown} query 原始搜索输入。
 * @returns {string[]} 归一化后的 token 列表。
 */
function tokenizeSettingSearchQuery(query) {
  return normalizeSettingSearchText(query)
    .split(' ')
    .filter(Boolean)
    .slice(0, MAX_TOKEN_COUNT)
    .map(token => token.slice(0, MAX_TOKEN_LENGTH))
}

/**
 * 计算单个 token 在单个文本上的得分。
 *
 * @param {string} token 归一化后的 token。
 * @param {string} text 归一化后的文本。
 * @param {{ exact: number, prefix: number, contains: number }} weight 权重表。
 * @returns {number} 得分，未命中为 0。
 */
function resolveTokenScore(token, text, weight) {
  if (!token || !text) {
    return 0
  }
  if (text === token) {
    return weight.exact
  }
  if (text.startsWith(token)) {
    return weight.prefix
  }
  if (text.includes(token)) {
    return weight.contains
  }
  return 0
}

/**
 * 单项匹配：逐 token 取最高字段分并累加，同时统计命中 token 数。
 *
 * @param {object} item 解析后的索引项。
 * @param {string[]} tokenList 归一化 token 列表。
 * @param {string} normalizedQuery 归一化整串 query。
 * @returns {{ score: number, matchedTokenCount: number, labelHitTokenCount: number }} 匹配结果。
 */
function matchSettingSearchItem(item, tokenList, normalizedQuery) {
  const normalized = item?.normalized ?? {}
  const labelNoSpace = normalizedQuery.replace(/\s+/g, '')
  let score = 0
  let matchedTokenCount = 0
  let labelHitTokenCount = 0

  tokenList.forEach((token) => {
    const labelScore = resolveTokenScore(token, normalized.label, LABEL_WEIGHT)
    const labelAltScore = resolveTokenScore(token, normalized.labelAlt, LABEL_ALT_WEIGHT)
    const keywordScore = (normalized.keywordList ?? [])
      .reduce((max, keyword) => Math.max(max, resolveTokenScore(token, keyword, KEYWORD_WEIGHT)), 0)
    const keymapScore = resolveTokenScore(token, normalized.keymap, KEYMAP_WEIGHT)
    const tokenScore = Math.max(labelScore, labelAltScore, keywordScore, keymapScore)

    if (tokenScore > 0) {
      matchedTokenCount += 1
      score += tokenScore
    }
    if (labelScore > 0 || labelAltScore > 0) {
      labelHitTokenCount += 1
    }
  })

  if (normalizedQuery.length > 0 && normalizedQuery === normalized.label) {
    score += WHOLE_QUERY_BONUS
  } else if (labelNoSpace.length > 0 && labelNoSpace === normalized.labelNoSpace) {
    score += WHOLE_QUERY_BONUS
  }

  return {
    score,
    matchedTokenCount,
    labelHitTokenCount,
  }
}

/**
 * 搜索设置项。
 *
 * 规则：
 * - 分词后任一 token 命中即保留（OR），不会因为某个词没命中而淘汰；
 * - 分组名 / tab 名仅在整串完全相等时展开该分组 / 该 tab 的全部项；
 * - 排序：命中 token 数 → 总分 → tab 顺序 → 索引声明顺序。
 *
 * @param {object} options
 * @param {Array<object>} options.itemList 解析后的索引项列表。
 * @param {unknown} options.query 原始搜索输入。
 * @returns {Array<object>} 命中项列表，按相关度排序。
 */
function searchSettingItems({ itemList, query }) {
  const sourceList = Array.isArray(itemList) ? itemList : []
  const normalizedQuery = normalizeSettingSearchText(query)
  const tokenList = tokenizeSettingSearchQuery(query)

  if (normalizedQuery.length === 0 || tokenList.length === 0) {
    return []
  }

  const matchedSectionIdSet = new Set()
  const matchedTabKeySet = new Set()

  sourceList.forEach((item) => {
    const sectionTitleList = item?.normalized?.sectionTitleList ?? []
    const tabTitleList = item?.normalized?.tabTitleList ?? []
    if (sectionTitleList.includes(normalizedQuery)) {
      matchedSectionIdSet.add(item.sectionId)
    }
    if (tabTitleList.includes(normalizedQuery)) {
      matchedTabKeySet.add(item.tabKey)
    }
  })

  const resultList = []

  sourceList.forEach((item, index) => {
    const match = matchSettingSearchItem(item, tokenList, normalizedQuery)
    const sectionBoost = matchedSectionIdSet.has(item.sectionId) ? SECTION_EXPAND_BONUS : 0
    const tabBoost = matchedTabKeySet.has(item.tabKey) ? TAB_EXPAND_BONUS : 0
    const expandBoost = Math.max(sectionBoost, tabBoost)

    if (match.matchedTokenCount === 0 && expandBoost === 0) {
      return
    }

    resultList.push({
      ...item,
      index,
      score: match.score + expandBoost,
      matchedTokenCount: match.matchedTokenCount,
      labelHitTokenCount: match.labelHitTokenCount,
    })
  })

  resultList.sort((a, b) => {
    return (b.matchedTokenCount - a.matchedTokenCount)
      || (b.score - a.score)
      || (a.tabOrder - b.tabOrder)
      || (a.index - b.index)
  })

  return resultList
}

/**
 * 把文本按 token 命中位置切成高亮片段，重叠区间会合并。
 *
 * @param {unknown} text 原始文本。
 * @param {string[]} tokenList 归一化 token 列表。
 * @returns {Array<{ text: string, hit: boolean }>} 片段列表。
 */
function splitSettingSearchHighlightSegments(text, tokenList) {
  const source = String(text ?? '')
  const tokens = Array.isArray(tokenList) ? tokenList.filter(Boolean) : []

  if (source.length === 0) {
    return []
  }
  if (tokens.length === 0) {
    return [{ text: source, hit: false }]
  }

  const lowerSource = source.toLowerCase()
  const rangeList = []

  tokens.forEach((token) => {
    const lowerToken = token.toLowerCase()
    if (lowerToken.length === 0) {
      return
    }
    let fromIndex = 0
    while (fromIndex <= lowerSource.length) {
      const hitIndex = lowerSource.indexOf(lowerToken, fromIndex)
      if (hitIndex < 0) {
        break
      }
      rangeList.push([hitIndex, hitIndex + lowerToken.length])
      fromIndex = hitIndex + lowerToken.length
    }
  })

  if (rangeList.length === 0) {
    return [{ text: source, hit: false }]
  }

  rangeList.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]))

  const mergedRangeList = []
  rangeList.forEach((range) => {
    const lastRange = mergedRangeList[mergedRangeList.length - 1]
    if (lastRange && range[0] <= lastRange[1]) {
      lastRange[1] = Math.max(lastRange[1], range[1])
      return
    }
    mergedRangeList.push([range[0], range[1]])
  })

  const segmentList = []
  let cursor = 0

  mergedRangeList.forEach(([start, end]) => {
    if (start > cursor) {
      segmentList.push({ text: source.slice(cursor, start), hit: false })
    }
    segmentList.push({ text: source.slice(start, end), hit: true })
    cursor = end
  })

  if (cursor < source.length) {
    segmentList.push({ text: source.slice(cursor), hit: false })
  }

  return segmentList
}

export {
  matchSettingSearchItem,
  normalizeSettingSearchText,
  searchSettingItems,
  splitSettingSearchHighlightSegments,
  tokenizeSettingSearchQuery,
}
