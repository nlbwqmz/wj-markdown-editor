import assert from 'node:assert/strict'

import { handlePreviewHashAnchorClick } from '../previewAnchorLinkScrollUtil.js'
import * as previewAnchorLinkScrollUtil from '../previewAnchorLinkScrollUtil.js'

const { test } = await import('node:test')

test('工具模块只暴露规格要求的 3 个具名导出', () => {
  assert.deepEqual(
    Object.keys(previewAnchorLinkScrollUtil).sort(),
    [
      'findPreviewAnchorTarget',
      'handlePreviewHashAnchorClick',
      'resolvePreviewScrollContainer',
    ],
  )
})

function createTargetElement({ id, name, top }) {
  return {
    id,
    getAttribute(attributeName) {
      if (attributeName === 'name') {
        return name ?? null
      }
      return null
    },
    getBoundingClientRect() {
      return { top }
    },
  }
}

function createPreviewContainer({ top = 0, clientTop = 0, scrollTop = 0, targets = [] } = {}) {
  return {
    clientTop,
    scrollTop,
    scrollToCalls: [],
    getBoundingClientRect() {
      return { top }
    },
    scrollTo(options) {
      this.scrollToCalls.push(options)
    },
    querySelector(selector) {
      return targets.find((target) => {
        const name = target.getAttribute?.('name')
        return selector.includes(`#${target.id}`)
          || selector.includes(`"${target.id}"`)
          || selector.includes(`'${target.id}'`)
          || (name && (selector.includes(`"${name}"`) || selector.includes(`'${name}'`)))
      }) ?? null
    },
    querySelectorAll() {
      return targets
    },
  }
}

function createClickEvent(href, { footnote = false } = {}) {
  const linkElement = {
    getAttribute(attributeName) {
      if (attributeName === 'href') {
        return href
      }
      return null
    },
  }
  let prevented = false

  return {
    preventedGetter: () => prevented,
    event: {
      target: {
        closest(selector) {
          if (selector === '.footnote-ref a, .footnote-backref') {
            return footnote ? linkElement : null
          }
          return selector.startsWith('a') ? linkElement : null
        },
      },
      preventDefault() {
        prevented = true
      },
    },
  }
}

function createAnchorEvent(href) {
  return createClickEvent(href)
}

function createFootnoteEvent(href) {
  return createClickEvent(href, { footnote: true })
}

test('点击普通 hash 锚点时，应阻止默认行为并直接跳转到预览容器目标位置', () => {
  const target = createTargetElement({
    id: 'section-1',
    top: 140,
  })
  const previewRoot = createPreviewContainer({
    top: 100,
    scrollTop: 100,
    targets: [target],
  })
  const { event, preventedGetter } = createClickEvent('#section-1')

  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
  })

  assert.equal(handled, true)
  assert.equal(preventedGetter(), true)
  assert.deepEqual(previewRoot.scrollToCalls, [{
    top: 140,
  }])
})

test('点击编码后的中文 hash 锚点时，应命中编码 id 并直接跳转', () => {
  const target = createTargetElement({
    id: '%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98',
    top: 180,
  })
  const previewRoot = createPreviewContainer({
    top: 60,
    scrollTop: 20,
    targets: [target],
  })
  const { event, preventedGetter } = createClickEvent('#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98')

  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
  })

  assert.equal(handled, true)
  assert.equal(preventedGetter(), true)
  assert.deepEqual(previewRoot.scrollToCalls, [{
    top: 140,
  }])
})

test('href 为外链时，不应拦截点击行为', () => {
  const previewRoot = createPreviewContainer()
  const { event, preventedGetter } = createClickEvent('https://example.com')

  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
  })

  assert.equal(handled, false)
  assert.equal(preventedGetter(), false)
  assert.equal(previewRoot.scrollToCalls.length, 0)
})

test('href 仅为井号时，应阻止默认行为且不执行锚点滚动', () => {
  const target = createTargetElement({
    id: '',
    top: 120,
  })
  const previewRoot = createPreviewContainer({
    targets: [target],
  })
  const { event, preventedGetter } = createClickEvent('#')

  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
  })

  assert.equal(handled, true)
  assert.equal(preventedGetter(), true)
  assert.equal(previewRoot.scrollToCalls.length, 0)
})

test('找不到锚点目标元素时，应阻止默认行为并触发缺失回调', () => {
  const previewRoot = createPreviewContainer()
  const { event, preventedGetter } = createClickEvent('#missing-target')
  const missingHrefList = []

  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
    onTargetMissing: ({ href }) => {
      missingHrefList.push(href)
    },
  })

  assert.equal(handled, true)
  assert.equal(preventedGetter(), true)
  assert.equal(previewRoot.scrollToCalls.length, 0)
  assert.deepEqual(missingHrefList, ['#missing-target'])
})

test('提供 previewScrollContainer 时，应滚动该容器而不是 previewRoot', () => {
  const target = createTargetElement({
    id: 'custom-container-target',
    top: 150,
  })
  const previewRoot = createPreviewContainer({
    top: 10,
    scrollTop: 5,
    targets: [target],
  })
  const customContainer = createPreviewContainer({
    top: 80,
    clientTop: 10,
    scrollTop: 30,
  })
  const { event, preventedGetter } = createClickEvent('#custom-container-target')

  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
    previewScrollContainer: () => customContainer,
  })

  assert.equal(handled, true)
  assert.equal(preventedGetter(), true)
  assert.equal(previewRoot.scrollToCalls.length, 0)
  assert.deepEqual(customContainer.scrollToCalls, [{
    top: 90,
  }])
})

test('previewScrollContainer 返回空值时，应回退到 previewRoot', () => {
  const target = createTargetElement({
    id: 'fallback-root-target',
    top: 160,
  })
  const previewRoot = createPreviewContainer({
    top: 120,
    clientTop: 4,
    scrollTop: 24,
    targets: [target],
  })
  const { event, preventedGetter } = createClickEvent('#fallback-root-target')

  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
    previewScrollContainer: () => null,
  })

  assert.equal(handled, true)
  assert.equal(preventedGetter(), true)
  assert.deepEqual(previewRoot.scrollToCalls, [{
    top: 60,
  }])
})

test('脚注 hash 链接应交还给脚注分支处理，不应触发通用锚点滚动', () => {
  const footnoteTarget = createTargetElement({
    id: 'fn1',
    top: 180,
  })
  const previewRoot = createPreviewContainer({
    top: 0,
    targets: [footnoteTarget],
  })
  const outerContainer = createPreviewContainer({
    top: 30,
    scrollTop: 40,
  })

  const { event, preventedGetter } = createFootnoteEvent('#fn1')
  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
    previewScrollContainer: () => outerContainer,
  })

  assert.equal(handled, false)
  assert.equal(preventedGetter(), false)
  assert.equal(previewRoot.scrollToCalls.length, 0)
  assert.equal(outerContainer.scrollToCalls.length, 0)
})

test('显式提供外层滚动容器时，普通 hash 锚点应优先滚动外层容器', () => {
  const target = createTargetElement({
    id: 'section-2',
    top: 220,
  })
  const previewRoot = createPreviewContainer({
    top: 40,
    scrollTop: 10,
    targets: [target],
  })
  const outerContainer = createPreviewContainer({
    top: 120,
    clientTop: 8,
    scrollTop: 30,
  })

  const { event, preventedGetter } = createAnchorEvent('#section-2')
  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
    previewScrollContainer: () => outerContainer,
  })

  assert.equal(handled, true)
  assert.equal(preventedGetter(), true)
  assert.equal(previewRoot.scrollToCalls.length, 0)
  assert.deepEqual(outerContainer.scrollToCalls, [{
    top: 122,
  }])
})

test('普通 hash 锚点即使以前缀 fn1 开头，也不应被误判为脚注', () => {
  const target = createTargetElement({
    id: 'fn1-section',
    top: 260,
  })
  const previewRoot = createPreviewContainer({
    top: 30,
    scrollTop: 12,
    targets: [target],
  })
  const outerContainer = createPreviewContainer({
    top: 100,
    clientTop: 6,
    scrollTop: 40,
  })

  const { event, preventedGetter } = createAnchorEvent('#fn1-section')
  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
    previewScrollContainer: () => outerContainer,
  })

  assert.equal(handled, true)
  assert.equal(preventedGetter(), true)
  assert.equal(previewRoot.scrollToCalls.length, 0)
  assert.deepEqual(outerContainer.scrollToCalls, [{
    top: 194,
  }])
})
