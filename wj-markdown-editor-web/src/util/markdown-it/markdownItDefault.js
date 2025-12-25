import { useCommonStore } from '@/stores/counter.js'
import markdownItAudio from '@/util/markdown-it/markdownItAudio.js'
import MarkdownItCodeBlock from '@/util/markdown-it/markdownItCodeBlock.js'
import markdownItContainerUtil from '@/util/markdown-it/markdownItContainerUtil.js'
import markdownItImage from '@/util/markdown-it/markdownItImage.js'
import markdownItLineNumber from '@/util/markdown-it/markdownItLineNumber.js'
import markdownItLink from '@/util/markdown-it/markdownItLink.js'
import markdownItTextColor from '@/util/markdown-it/markdownItTextColor.js'
import markdownItVideo from '@/util/markdown-it/markdownItVideo.js'
import { imgSize } from '@mdit/plugin-img-size'
import MarkdownItKatex from '@vscode/markdown-it-katex'
import MarkdownIt from 'markdown-it'
import MarkdownItAnchor from 'markdown-it-anchor'
import MarkdownItContainer from 'markdown-it-container'
import MarkdownItDefList from 'markdown-it-deflist'
import MarkdownItGitHubAlerts from 'markdown-it-github-alerts'
import MarkdownItIns from 'markdown-it-ins'
import MarkdownItMark from 'markdown-it-mark'
import MarkdownItSub from 'markdown-it-sub'
import MarkdownItSup from 'markdown-it-sup'
import MarkdownItTaskLists from 'markdown-it-task-lists'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: useCommonStore().config.markdown.typographer,
  xhtmlOut: true,
})

md.use(MarkdownItSup)
  .use(MarkdownItSub)
  .use(MarkdownItDefList)
  .use(MarkdownItIns)
  .use(MarkdownItMark)
  .use(MarkdownItTaskLists)
  .use(MarkdownItGitHubAlerts)
  .use(MarkdownItKatex, { throwOnError: false })
  .use(MarkdownItCodeBlock)
  .use(MarkdownItAnchor)
  .use(imgSize)

// 文字颜色
markdownItTextColor(md)

// 给本地图片加上自定义协议
markdownItImage(md)

// 给链接加上_blank
markdownItLink(md)

// 添加原始文本对应的行号区域
markdownItLineNumber(md)

// 容器
markdownItContainerUtil.createContainerPlugin(md, ['info', 'warning', 'danger', 'tip', 'important', 'details'])
  .forEach((containerPlugin) => {
    md.use(MarkdownItContainer, containerPlugin.type, containerPlugin)
  })

// 视频
markdownItVideo(md)

// 音频
markdownItAudio(md)

export default md
