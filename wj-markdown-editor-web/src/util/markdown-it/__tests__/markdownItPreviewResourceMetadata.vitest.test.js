import MarkdownIt from 'markdown-it'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/util/commonUtil.js', async () => {
  const actual = await vi.importActual('@/util/resourceUrlUtil.js')
  return {
    default: {
      convertResourceUrl: actual.convertResourceUrl,
    },
  }
})

const { default: markdownItAudio } = await import('../markdownItAudio.js')
const { default: markdownItImage } = await import('../markdownItImage.js')
const { default: markdownItLink } = await import('../markdownItLink.js')
const { default: markdownItVideo } = await import('../markdownItVideo.js')

function createMarkdownIt() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
    xhtmlOut: true,
  })
  markdownItImage(md)
  markdownItLink(md)
  markdownItVideo(md)
  markdownItAudio(md)
  return md
}

describe('markdown-it preview resource metadata', () => {
  it('真实渲染的远程图片和远程链接必须暴露资源 dataset 与 markdown 引用', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('![远程图](https://example.com/assets/demo.png)\n\n[远程链接](https://example.com/docs)\n')

    expect(renderedHtml).toMatch(/<img [^>]*data-wj-resource-kind="image"[^>]*data-wj-resource-src="https:\/\/example\.com\/assets\/demo\.png"[^>]*data-wj-resource-raw="https:\/\/example\.com\/assets\/demo\.png"[^>]*data-wj-markdown-reference="!\[远程图\]\(https:\/\/example\.com\/assets\/demo\.png\)"/u)
    expect(renderedHtml).toMatch(/<a [^>]*href="https:\/\/example\.com\/docs"[^>]*data-wj-resource-kind="link"[^>]*data-wj-resource-src="https:\/\/example\.com\/docs"[^>]*data-wj-resource-raw="https:\/\/example\.com\/docs"[^>]*data-wj-markdown-reference="\[远程链接\]\(https:\/\/example\.com\/docs\)"/u)
  })

  it('真实渲染的远程音视频必须暴露资源 dataset 与 markdown 引用', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('!video(https://example.com/media/demo.mp4)\n\n!audio(https://example.com/media/demo.mp3)\n')

    expect(renderedHtml).toMatch(/<video [^>]*data-wj-resource-kind="video"[^>]*data-wj-resource-src="https:\/\/example\.com\/media\/demo\.mp4"[^>]*data-wj-resource-raw="https:\/\/example\.com\/media\/demo\.mp4"[^>]*data-wj-markdown-reference="!video\(https:\/\/example\.com\/media\/demo\.mp4\)"/u)
    expect(renderedHtml).toMatch(/<audio [^>]*data-wj-resource-kind="audio"[^>]*data-wj-resource-src="https:\/\/example\.com\/media\/demo\.mp3"[^>]*data-wj-resource-raw="https:\/\/example\.com\/media\/demo\.mp3"[^>]*data-wj-markdown-reference="!audio\(https:\/\/example\.com\/media\/demo\.mp3\)"/u)
  })

  it('linkify 链接后跟 ). 时，markdown 引用不应吞入尾随标点', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('See https://example.com/docs).')

    expect(renderedHtml).toMatch(/<a [^>]*href="https:\/\/example\.com\/docs"[^>]*data-wj-markdown-reference="https:\/\/example\.com\/docs"/u)
    expect(renderedHtml).toContain('</a>).')
  })

  it('linkify 链接后跟逗号时，markdown 引用不应吞入尾随标点', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('See https://example.com/docs,')

    expect(renderedHtml).toMatch(/<a [^>]*href="https:\/\/example\.com\/docs"[^>]*data-wj-markdown-reference="https:\/\/example\.com\/docs"/u)
    expect(renderedHtml).toContain('</a>,')
  })

  it('data 图片与锚点链接不应进入预览资源菜单链路', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('![内联图](data:image/png;base64,abc)\n\n[锚点](#chapter)\n')

    expect(renderedHtml).not.toMatch(/data-wj-resource-kind="image"/u)
    expect(renderedHtml).not.toMatch(/data-wj-resource-kind="link"/u)
  })
})
