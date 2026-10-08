import assert from 'node:assert/strict'

const { test } = await import('node:test')

let documentDropOpenUtilModule = null

try {
  documentDropOpenUtilModule = await import('../documentDropOpenUtil.js')
} catch {
  documentDropOpenUtilModule = null
}

/**
 * 安装 window.node 桩，模拟 preload 暴露的本地路径解析能力。
 *
 * @param {(file: object) => string | null} [getWebFilePathImpl]
 */
function installWindowNodeMock(getWebFilePathImpl) {
  globalThis.window = {
    node: {
      getWebFilePath: typeof getWebFilePathImpl === 'function'
        ? getWebFilePathImpl
        : file => (file && typeof file.path === 'string' ? file.path : null),
    },
  }
}

/**
 * 注册统一打开交互桩，并记录 renderer 侧实际发起的打开请求。
 *
 * @param {object} options
 * @param {Array<object>} options.openedRequestList
 * @param {(path: string, options: object) => Promise<object>} [options.requestImpl]
 * @returns {Promise<Function>} 用于撤销注册的清理函数。
 */
async function installOpenInteractionMock({ openedRequestList, requestImpl }) {
  const { registerDocumentOpenInteractionService } = await import('../documentOpenInteractionService.js')

  return registerDocumentOpenInteractionService({
    async requestDocumentOpenPath(path, options) {
      openedRequestList.push({ path, options })
      if (typeof requestImpl === 'function') {
        return await requestImpl(path, options)
      }
      return { ok: true, reason: 'opened', path }
    },
  })
}

test('isMarkdownFileName 必须识别 .md / .markdown 且忽略大小写', () => {
  assert.ok(documentDropOpenUtilModule, '缺少拖拽打开文档工具')

  const { isMarkdownFileName } = documentDropOpenUtilModule

  assert.equal(isMarkdownFileName('note.md'), true)
  assert.equal(isMarkdownFileName('NOTE.MD'), true)
  assert.equal(isMarkdownFileName('note.Markdown'), true)
  assert.equal(isMarkdownFileName('  note.md  '), true)
  assert.equal(isMarkdownFileName('note.mdx'), false)
  assert.equal(isMarkdownFileName('note.txt'), false)
  assert.equal(isMarkdownFileName(''), false)
  assert.equal(isMarkdownFileName(null), false)
})

test('pickFirstMarkdownFile 必须跳过非 Markdown 文件并返回第一个命中项', () => {
  assert.ok(documentDropOpenUtilModule, '缺少拖拽打开文档工具')

  const { pickFirstMarkdownFile } = documentDropOpenUtilModule

  assert.equal(pickFirstMarkdownFile(null), null)
  assert.equal(pickFirstMarkdownFile([]), null)
  assert.equal(pickFirstMarkdownFile([{ name: 'photo.png' }, { name: 'archive.zip' }]), null)

  const firstMarkdownFile = { name: 'first.md', path: 'D:/docs/first.md' }
  const secondMarkdownFile = { name: 'second.markdown', path: 'D:/docs/second.markdown' }
  assert.equal(pickFirstMarkdownFile([
    { name: 'photo.png' },
    firstMarkdownFile,
    secondMarkdownFile,
  ]), firstMarkdownFile)
})

test('拖入列表不含 Markdown 时不得接管，也不得发起打开请求', async () => {
  assert.ok(documentDropOpenUtilModule, '缺少拖拽打开文档工具')

  installWindowNodeMock()
  const openedRequestList = []
  const cleanup = await installOpenInteractionMock({ openedRequestList })

  try {
    const result = documentDropOpenUtilModule.requestOpenDroppedMarkdownDocument([
      { name: 'photo.png', path: 'D:/docs/photo.png' },
      { name: 'note.txt', path: 'D:/docs/note.txt' },
    ])

    assert.equal(result, false)
    assert.equal(openedRequestList.length, 0)
  } finally {
    cleanup()
  }
})

test('拖入 Markdown 时必须按统一打开交互发起打开请求', async () => {
  assert.ok(documentDropOpenUtilModule, '缺少拖拽打开文档工具')

  installWindowNodeMock()
  const openedRequestList = []
  const cleanup = await installOpenInteractionMock({ openedRequestList })

  try {
    const result = documentDropOpenUtilModule.requestOpenDroppedMarkdownDocument([
      { name: 'photo.png', path: 'D:/docs/photo.png' },
      { name: 'note.md', path: 'D:/docs/note.md' },
      { name: 'second.markdown', path: 'D:/docs/second.markdown' },
    ])

    assert.equal(result, true)
    assert.equal(openedRequestList.length, 1)
    assert.equal(openedRequestList[0].path, 'D:/docs/note.md')
    assert.deepEqual(openedRequestList[0].options, {
      entrySource: 'drag-drop',
      trigger: 'user',
    })
  } finally {
    cleanup()
  }
})

test('拿不到本地路径时仍需接管拖拽，避免回落到资源插入链路', async () => {
  assert.ok(documentDropOpenUtilModule, '缺少拖拽打开文档工具')

  installWindowNodeMock(() => null)
  const openedRequestList = []
  const cleanup = await installOpenInteractionMock({ openedRequestList })

  try {
    const result = documentDropOpenUtilModule.requestOpenDroppedMarkdownDocument([
      { name: 'note.md', path: 'D:/docs/note.md' },
    ])

    assert.equal(result, true)
    assert.equal(openedRequestList.length, 0)
  } finally {
    cleanup()
  }
})

test('打开请求被拒绝时不得抛出未处理异常', async () => {
  assert.ok(documentDropOpenUtilModule, '缺少拖拽打开文档工具')

  installWindowNodeMock()
  const openedRequestList = []
  const cleanup = await installOpenInteractionMock({
    openedRequestList,
    requestImpl: async () => {
      throw new Error('open failed')
    },
  })

  try {
    const result = documentDropOpenUtilModule.requestOpenDroppedMarkdownDocument([
      { name: 'note.md', path: 'D:/docs/note.md' },
    ])

    assert.equal(result, true)
    // 等待内部 catch 链消化拒绝，若存在未处理拒绝会让 node:test 失败。
    await new Promise(resolve => setTimeout(resolve, 0))
  } finally {
    cleanup()
  }
})
