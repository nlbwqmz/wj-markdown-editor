import assert from 'node:assert/strict'

const { test } = await import('node:test')

let htmlImageTagUtilModule = null

try {
  htmlImageTagUtilModule = await import('../htmlImageTagUtil.js')
} catch {
  htmlImageTagUtilModule = null
}

function requireParseHtmlImageTag() {
  assert.ok(htmlImageTagUtilModule, '缺少 html image tag util')

  const { parseHtmlImageTag } = htmlImageTagUtilModule
  assert.equal(typeof parseHtmlImageTag, 'function')

  return parseHtmlImageTag
}

test('解析无引号且以斜杠结尾的远程 src 时，应把末尾斜杠保留在属性值里', () => {
  const parseHtmlImageTag = requireParseHtmlImageTag()
  const parsedTag = parseHtmlImageTag('<img src=https://cdn.example.com/a/>')

  assert.ok(parsedTag)
  const srcAttribute = parsedTag.attributes.find(attribute => attribute.name === 'src')
  assert.equal(srcAttribute?.value, 'https://cdn.example.com/a/')
  assert.equal(srcAttribute?.rawValueText, 'https://cdn.example.com/a/')
  assert.equal(parsedTag.selfClosing, false)
})

test('解析无引号且以斜杠结尾的本地 src 时，应把末尾斜杠保留在属性值里', () => {
  const parseHtmlImageTag = requireParseHtmlImageTag()
  const parsedTag = parseHtmlImageTag('<img src=./assets/>')

  assert.ok(parsedTag)
  const srcAttribute = parsedTag.attributes.find(attribute => attribute.name === 'src')
  assert.equal(srcAttribute?.value, './assets/')
  assert.equal(srcAttribute?.rawValueText, './assets/')
  assert.equal(parsedTag.selfClosing, false)
})
