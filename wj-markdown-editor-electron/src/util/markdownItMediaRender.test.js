import { describe, expect, it, vi } from 'vitest'

import markdownItAudio from '../../../wj-markdown-editor-web/src/util/markdown-it/markdownItAudio.js'
import markdownItVideo from '../../../wj-markdown-editor-web/src/util/markdown-it/markdownItVideo.js'

vi.mock('@/util/commonUtil.js', async () => {
  const resourceUrlUtil = await import('../../../wj-markdown-editor-web/src/util/resourceUrlUtil.js')
  return {
    default: {
      convertResourceUrl: resourceUrlUtil.convertResourceUrl,
    },
  }
})

vi.mock('@/util/resourceUrlUtil.js', async () => {
  return await import('../../../wj-markdown-editor-web/src/util/resourceUrlUtil.js')
})

function createMarkdownItMock() {
  return {
    inline: {
      ruler: {
        push: vi.fn(),
      },
    },
    renderer: {
      rules: {},
    },
    utils: {
      escapeHtml(value) {
        return value
          .replaceAll('&', '&amp;')
          .replaceAll('"', '&quot;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
      },
    },
  }
}

function createInlineStateMock(src) {
  const tokenList = []
  return {
    src,
    pos: 0,
    posMax: src.length,
    level: 0,
    push(type, tag, nesting) {
      const token = {
        type,
        tag,
        nesting,
        content: '',
        level: 0,
      }
      tokenList.push(token)
      return token
    },
    tokenList,
  }
}

describe('markdownIt media render', () => {
  it('视频语法解析应支持文件名中包含右括号', () => {
    const md = createMarkdownItMock()
    markdownItVideo(md)
    const videoRule = md.inline.ruler.push.mock.calls.find(call => call[0] === 'video')?.[1]
    const state = createInlineStateMock('!video(./video/demo(1).mp4)')

    const matched = videoRule(state, false)

    expect(matched).toBe(true)
    expect(state.tokenList).toHaveLength(1)
    expect(state.tokenList[0].content).toBe('./video/demo(1).mp4')
    expect(state.pos).toBe(state.src.length)
  })

  it('音频语法解析应支持文件名中包含右括号', () => {
    const md = createMarkdownItMock()
    markdownItAudio(md)
    const audioRule = md.inline.ruler.push.mock.calls.find(call => call[0] === 'audio')?.[1]
    const state = createInlineStateMock('!audio(./audio/demo(1).mp3)')

    const matched = audioRule(state, false)

    expect(matched).toBe(true)
    expect(state.tokenList).toHaveLength(1)
    expect(state.tokenList[0].content).toBe('./audio/demo(1).mp3')
    expect(state.pos).toBe(state.src.length)
  })

  it('视频资源的协议地址应基于原始路径生成，而不是基于 HTML 转义后的路径', () => {
    const md = createMarkdownItMock()
    markdownItVideo(md)

    const html = md.renderer.rules.video([
      { content: './video/a&b.mp4' },
    ], 0)

    expect(html).toContain('src="wj://2e2f766964656f2f6126622e6d7034"')
    expect(html).toContain('data-wj-resource-src="./video/a&amp;b.mp4"')
  })

  it('音频资源的协议地址应基于原始路径生成，而不是基于 HTML 转义后的路径', () => {
    const md = createMarkdownItMock()
    markdownItAudio(md)

    const html = md.renderer.rules.audio([
      { content: './audio/a&b.mp3' },
    ], 0)

    expect(html).toContain('src="wj://2e2f617564696f2f6126622e6d7033"')
    expect(html).toContain('data-wj-resource-src="./audio/a&amp;b.mp3"')
  })
})
