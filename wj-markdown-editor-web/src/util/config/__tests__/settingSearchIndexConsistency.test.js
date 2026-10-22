import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { test } = await import('node:test')

const settingSearchIndexModule = await import('../settingSearchIndex.js')

const { SETTING_SEARCH_ITEM_LIST, SETTING_SECTION_META } = settingSearchIndexModule

const settingViewSource = readFileSync(new URL('../../../views/SettingView.vue', import.meta.url), 'utf8')

const SETTING_TAB_KEY_LIST = ['general', 'appearance', 'editor', 'shortcut', 'fileAndImage', 'exportAndWatermark']

/**
 * 收集模板中被引用的静态 id，动态拼接（含 ${} 或 +）的调用会被过滤掉。
 */
function collectMatchedValueSet(pattern) {
  const valueSet = new Set()

  for (const match of settingViewSource.matchAll(pattern)) {
    const value = match[1]
    if (!/^[A-Z0-9.]+$/i.test(value)) {
      continue
    }
    valueSet.add(value)
  }

  return valueSet
}

function collectTemplateItemIdSet() {
  const valueSet = new Set([
    ...collectMatchedValueSet(/isSettingItemVisible\('([^']+)'\)/g),
    ...collectMatchedValueSet(/settingLabel\('([^']+)'\)/g),
    ...collectMatchedValueSet(/SettingSearchLabel id="([^"]+)"/g),
  ])

  return valueSet
}

test('索引静态 id 必须与模板标记完全一致', () => {
  const templateIdList = [...collectTemplateItemIdSet()].sort()
  const indexIdList = SETTING_SEARCH_ITEM_LIST.map(item => item.id).sort()

  assert.deepEqual(templateIdList, indexIdList, '索引与模板存在漂移：请同步 settingSearchIndex.js 与 SettingView.vue')
})

test('索引 id 必须唯一且包含 labelKey', () => {
  const idList = SETTING_SEARCH_ITEM_LIST.map(item => item.id)

  assert.equal(new Set(idList).size, idList.length, '索引存在重复 id')
  SETTING_SEARCH_ITEM_LIST.forEach((item) => {
    assert.equal(typeof item.labelKey, 'string')
    assert.ok(item.labelKey.length > 0, `索引项 ${item.id} 缺少 labelKey`)
    assert.ok(Array.isArray(item.keywords ?? []), `索引项 ${item.id} 的 keywords 必须是数组`)
  })
})

test('索引项 sectionId 必须在分组元数据中定义', () => {
  SETTING_SEARCH_ITEM_LIST.forEach((item) => {
    assert.ok(SETTING_SECTION_META[item.sectionId], `索引项 ${item.id} 的 sectionId 未在 SETTING_SECTION_META 中定义`)
  })
})

test('分组元数据的 tabKey 必须是合法 tab', () => {
  Object.entries(SETTING_SECTION_META).forEach(([sectionId, meta]) => {
    assert.ok(SETTING_TAB_KEY_LIST.includes(meta.tabKey), `分组 ${sectionId} 的 tabKey 非法`)
    assert.equal(typeof meta.titleKey, 'string')
  })
})

test('模板中的面板可见性调用必须覆盖全部 tab', () => {
  const panelKeySet = collectMatchedValueSet(/isSettingPanelVisible\('([^']+)'\)/g)

  assert.deepEqual([...panelKeySet].sort(), [...SETTING_TAB_KEY_LIST].sort())
})

test('模板中的分组标记必须与分组元数据完全一致', () => {
  const sectionAttrSet = collectMatchedValueSet(/data-setting-section="([^"]+)"/g)

  assert.deepEqual([...sectionAttrSet].sort(), Object.keys(SETTING_SECTION_META).sort())
})
