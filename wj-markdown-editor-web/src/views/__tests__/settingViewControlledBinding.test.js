import assert from 'node:assert/strict'
import fs from 'node:fs'

const { test } = await import('node:test')

function readSettingViewSource() {
  return fs.readFileSync(new URL('../SettingView.vue', import.meta.url), 'utf8')
}

function collectDuplicatedModelUpdateBindingTagList(source) {
  const tagList = source.match(/<[^/!][^>]*>/gu) ?? []

  return tagList.filter((tagSource) => {
    const modelArgumentMatch = tagSource.match(/\bv-model:([a-zA-Z0-9-]+)=/u)
    if (!modelArgumentMatch) {
      return false
    }

    const modelArgument = modelArgumentMatch[1]
    return tagSource.includes(`@update:${modelArgument}=`)
  })
}

test('设置页不应在同一组件上同时声明 v-model 与同名 update 事件', () => {
  const source = readSettingViewSource()
  const duplicatedBindingTagList = collectDuplicatedModelUpdateBindingTagList(source)

  assert.deepEqual(duplicatedBindingTagList, [])
})
