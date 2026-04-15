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
const { default: markdownItHtmlImage } = await import('../markdownItHtmlImage.js')
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
  markdownItHtmlImage(md)
  markdownItLink(md)
  markdownItVideo(md)
  markdownItAudio(md)
  return md
}

function extractMarkdownReferenceList(renderedHtml) {
  return Array.from(
    renderedHtml.matchAll(/data-wj-markdown-reference="([^"]+)"/gu),
    ([, markdownReference]) => markdownReference,
  )
}

describe('markdown-it preview resource metadata', () => {
  it('真实渲染的 HTML 本地图片必须保留现有属性并暴露资源 dataset 与原始 HTML 引用', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('<img src="../assets/demo.png" style="width: 120px" class="demo-image" alt="示例" />')

    expect(renderedHtml).toMatch(/<img [^>]*src="wj:\/\/[^"?]+\?wj_date=\d+"[^>]*style="width: 120px"[^>]*class="demo-image"[^>]*alt="示例"[^>]*data-wj-resource-kind="image"[^>]*data-wj-resource-src="\.\.\/assets\/demo\.png"[^>]*data-wj-resource-raw="\.\.\/assets\/demo\.png"[^>]*data-wj-markdown-reference="&lt;img src=&quot;\.\.\/assets\/demo\.png&quot; style=&quot;width: 120px&quot; class=&quot;demo-image&quot; alt=&quot;示例&quot; \/&gt;"/u)
  })

  it('hTML 其他标签不应被图片资源处理链路改写', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('<div class="demo-box"></div><span>text</span>')

    expect(renderedHtml).toContain('<div class="demo-box"></div><span>text</span>')
    expect(renderedHtml).not.toContain('data-wj-resource-kind=')
  })

  it('显式关闭 HTML 图片资源管理时，不应改写 img 标签', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('<img src="/assets/demo.png" style="width: 120px" alt="示例" />', {
      manageHtmlImageResources: false,
    })

    expect(renderedHtml).toBe('<img src="/assets/demo.png" style="width: 120px" alt="示例" />')
    expect(renderedHtml).not.toContain('data-wj-resource-kind=')
  })

  it('重写 HTML 图片时，不应把已有的 HTML 实体再次编码', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('<img src="https://cdn.example/a.png?x=1&amp;y=2" alt="Tom &amp; Jerry" title="A &quot;quote&quot;" />')

    expect(renderedHtml).toContain('src="https://cdn.example/a.png?x=1&amp;y=2"')
    expect(renderedHtml).toContain('alt="Tom &amp; Jerry"')
    expect(renderedHtml).toContain('title="A &quot;quote&quot;"')
    expect(renderedHtml).not.toContain('src="https://cdn.example/a.png?x=1&amp;amp;y=2"')
    expect(renderedHtml).not.toContain('alt="Tom &amp;amp; Jerry"')
    expect(renderedHtml).not.toContain('title="A &amp;quot;quote&amp;quot;"')
  })

  it('img-* 自定义元素外层标签即使带 src，也不应被当作原生图片改写', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('<img-comparison-slider src="./slider-config.json"><img slot="first" src="./a.png" /><img slot="second" src="./b.png" /></img-comparison-slider>')

    expect(renderedHtml).toContain('<img-comparison-slider src="./slider-config.json">')
    expect(renderedHtml).toContain('</img-comparison-slider>')
    expect(renderedHtml).toMatch(/<img [^>]*slot="first"[^>]*data-wj-resource-kind="image"/u)
    expect(renderedHtml).toMatch(/<img [^>]*slot="second"[^>]*data-wj-resource-kind="image"/u)
    expect(renderedHtml).not.toContain('<img -comparison-slider')
  })

  it('script 文本里的伪 img 字面量不应被 HTML 图片重写逻辑改写', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('<script>const tpl = "<img src=\'./assets/demo.png\' />"</script>\n<img src="./assets/demo.png" style="width: 120px" />')

    expect(renderedHtml).toContain(`<script>const tpl = "<img src='./assets/demo.png' />"</script>`)
    expect(renderedHtml).toMatch(/<img [^>]*src="wj:\/\/[^"]+"[^>]*style="width: 120px"[^>]*data-wj-resource-kind="image"/u)
    expect(renderedHtml.match(/data-wj-resource-kind="image"/gu)).toHaveLength(1)
  })

  it('textarea 与 template 容器里的伪 img 字面量不应被 HTML 图片重写逻辑改写', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render([
      'foo <textarea><img src="./assets/demo.png" /></textarea>',
      'foo <template><img src="./assets/demo.png" /></template>',
      '<img src="./assets/demo.png" style="width: 120px" />',
    ].join('\n'))

    expect(renderedHtml).toContain('<textarea><img src="./assets/demo.png" /></textarea>')
    expect(renderedHtml).toContain('<template><img src="./assets/demo.png" /></template>')
    expect(renderedHtml).toMatch(/<img [^>]*src="wj:\/\/[^"]+"[^>]*style="width: 120px"[^>]*data-wj-resource-kind="image"/u)
    expect(renderedHtml.match(/data-wj-resource-kind="image"/gu)).toHaveLength(1)
  })

  it('其他标签属性值里的伪 img 字面量不应被 HTML 图片重写逻辑改写', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('<div data-template="<img src=\'./assets/demo.png\' />"></div>\n<img src="./assets/demo.png" style="width: 120px" />')

    expect(renderedHtml).toContain(`<div data-template="<img src='./assets/demo.png' />"></div>`)
    expect(renderedHtml).toMatch(/<img [^>]*src="wj:\/\/[^"]+"[^>]*style="width: 120px"[^>]*data-wj-resource-kind="image"/u)
    expect(renderedHtml.match(/data-wj-resource-kind="image"/gu)).toHaveLength(1)
  })

  it('协议相对 URL 与 blob/file 等不受支持的 HTML 图片源不应被 fallback 改写', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render([
      '<img src="//cdn.example.com/demo.png" alt="协议相对" />',
      '<img src="blob:https://example.com/demo.png" alt="Blob" />',
      '<img src="file:///C:/docs/demo.png" alt="File" />',
    ].join('\n'))

    expect(renderedHtml).toContain('<img src="//cdn.example.com/demo.png" alt="协议相对" />')
    expect(renderedHtml).toContain('<img src="blob:https://example.com/demo.png" alt="Blob" />')
    expect(renderedHtml).toContain('<img src="file:///C:/docs/demo.png" alt="File" />')
    expect(renderedHtml).not.toContain('?wj_date=')
    expect(renderedHtml).not.toContain('data-wj-resource-kind=')
  })

  it('重写无引号且以斜杠结尾的 HTML 本地图片时，应保留 src 末尾的斜杠', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('<img src=./assets/>')

    expect(renderedHtml).toMatch(/<img [^>]*src="wj:\/\/[^"?]+\?wj_date=\d+"[^>]*data-wj-resource-src="\.\/assets\/"[^>]*data-wj-resource-raw="\.\/assets\/"/u)
  })

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

  it('转义的伪括号链接不应抢占真实 token 的 markdown 引用', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('\\[假链](https://example.com/a) [真链](https://example.com/a)')

    expect(extractMarkdownReferenceList(renderedHtml)).toEqual([
      'https://example.com/a',
      '[真链](https://example.com/a)',
    ])
    expect(renderedHtml).not.toContain('data-wj-markdown-reference="[假链](https://example.com/a)"')
  })

  it('code span 内的伪链接不应进入资源引用候选列表', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('`[假链](https://example.com/a)` [真链](https://example.com/a)')

    expect(extractMarkdownReferenceList(renderedHtml)).toEqual([
      '[真链](https://example.com/a)',
    ])
    expect(renderedHtml).not.toContain('data-wj-markdown-reference="[假链](https://example.com/a)"')
  })

  it('data 图片与锚点链接不应进入预览资源菜单链路', () => {
    const md = createMarkdownIt()
    const renderedHtml = md.render('![内联图](data:image/png;base64,abc)\n\n[锚点](#chapter)\n')

    expect(renderedHtml).not.toMatch(/data-wj-resource-kind="image"/u)
    expect(renderedHtml).not.toMatch(/data-wj-resource-kind="link"/u)
  })
})
