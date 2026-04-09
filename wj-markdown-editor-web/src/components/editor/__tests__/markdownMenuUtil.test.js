import assert from 'node:assert/strict'

const { test } = await import('node:test')
const markdownMenuUtilModule = await import('../markdownMenuUtil.js')

const {
  flattenMarkdownMenuAnchors,
  resolveMarkdownMenuActiveHref,
  resolveMarkdownMenuTypography,
  resolveMarkdownMenuTargetScrollTop,
} = markdownMenuUtilModule

test('flattenMarkdownMenuAnchors 应按前序顺序拍平目录树并保留层级深度', () => {
  const anchorList = [
    {
      key: 'intro',
      href: '#intro',
      title: '介绍',
      level: 1,
      children: [
        {
          key: 'session',
          href: '#session',
          title: '会话',
          level: 2,
          children: [],
        },
      ],
    },
    {
      key: 'appendix',
      href: '#appendix',
      title: '附录',
      level: 1,
      children: [],
    },
  ]

  assert.deepEqual(flattenMarkdownMenuAnchors(anchorList), [
    { key: 'intro', href: '#intro', title: '介绍', level: 1, depth: 0 },
    { key: 'session', href: '#session', title: '会话', level: 2, depth: 1 },
    { key: 'appendix', href: '#appendix', title: '附录', level: 1, depth: 0 },
  ])
})

test('resolveMarkdownMenuActiveHref 应跟随 scrollTop 选择当前阅读位置最近的标题', () => {
  const headingRecords = [
    { href: '#intro', top: 0 },
    { href: '#session', top: 120 },
    { href: '#resource', top: 260 },
  ]

  assert.equal(resolveMarkdownMenuActiveHref({
    headingRecords,
    scrollTop: 0,
    clientHeight: 320,
    scrollHeight: 900,
  }), '#intro')

  assert.equal(resolveMarkdownMenuActiveHref({
    headingRecords,
    scrollTop: 150,
    clientHeight: 320,
    scrollHeight: 900,
  }), '#session')

  assert.equal(resolveMarkdownMenuActiveHref({
    headingRecords,
    scrollTop: 640,
    clientHeight: 320,
    scrollHeight: 900,
  }), '#resource')
})

test('resolveMarkdownMenuActiveHref 应按 a-anchor 的 bounds 语义提前激活接近顶部的标题', () => {
  const headingRecords = [
    { href: '#intro', top: 0 },
    { href: '#session', top: 120 },
    { href: '#resource', top: 260 },
  ]

  assert.equal(resolveMarkdownMenuActiveHref({
    headingRecords,
    scrollTop: 255,
    clientHeight: 320,
    scrollHeight: 900,
  }), '#session')

  assert.equal(resolveMarkdownMenuActiveHref({
    headingRecords,
    scrollTop: 256,
    clientHeight: 320,
    scrollHeight: 900,
  }), '#resource')

  assert.equal(resolveMarkdownMenuActiveHref({
    headingRecords,
    scrollTop: 259,
    clientHeight: 320,
    scrollHeight: 900,
  }), '#resource')
})

test('resolveMarkdownMenuActiveHref 在首屏即可完整显示的文档顶部，应保持首个标题高亮', () => {
  const headingRecords = [
    { href: '#intro', top: 0 },
    { href: '#session', top: 120 },
    { href: '#resource', top: 240 },
  ]

  assert.equal(resolveMarkdownMenuActiveHref({
    headingRecords,
    scrollTop: 0,
    clientHeight: 320,
    scrollHeight: 260,
  }), '#intro')
})

test('resolveMarkdownMenuTargetScrollTop 应按容器相对坐标计算平滑滚动目标位置', () => {
  const targetScrollTop = resolveMarkdownMenuTargetScrollTop({
    containerTop: 100,
    containerScrollTop: 40,
    containerClientTop: 2,
    targetTop: 260,
  })

  assert.equal(targetScrollTop, 198)
})

test('resolveMarkdownMenuTypography 应按标题等级返回递减的字号与字重', () => {
  assert.deepEqual(resolveMarkdownMenuTypography(1), {
    fontSize: '15px',
    fontWeight: 600,
  })

  assert.deepEqual(resolveMarkdownMenuTypography(3), {
    fontSize: '13px',
    fontWeight: 500,
  })

  assert.deepEqual(resolveMarkdownMenuTypography(6), {
    fontSize: '11px',
    fontWeight: 400,
  })

  assert.deepEqual(resolveMarkdownMenuTypography(9), {
    fontSize: '11px',
    fontWeight: 400,
  })
})
