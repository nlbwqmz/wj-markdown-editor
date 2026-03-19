import assert from 'node:assert/strict'

import { handlePreviewHashAnchorClick } from '../previewAnchorLinkScrollUtil.js'

const { test } = await import('node:test')

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

function createClickEvent(href) {
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
          return selector.startsWith('a') ? linkElement : null
        },
      },
      preventDefault() {
        prevented = true
      },
    },
  }
}

test('点击普通 hash 锚点时，应阻止默认行为并平滑滚动到预览容器目标位置', () => {
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
    behavior: 'smooth',
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

test('href 仅为井号时，不应执行锚点滚动', () => {
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

  assert.equal(handled, false)
  assert.equal(preventedGetter(), false)
  assert.equal(previewRoot.scrollToCalls.length, 0)
})

test('找不到锚点目标元素时，不应阻止默认行为', () => {
  const previewRoot = createPreviewContainer()
  const { event, preventedGetter } = createClickEvent('#missing-target')

  const handled = handlePreviewHashAnchorClick({
    event,
    previewRoot,
  })

  assert.equal(handled, false)
  assert.equal(preventedGetter(), false)
  assert.equal(previewRoot.scrollToCalls.length, 0)
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
    behavior: 'smooth',
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
    behavior: 'smooth',
  }])
})
