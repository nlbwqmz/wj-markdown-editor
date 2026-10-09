const fs = require('node:fs')
const path = require('node:path')

// electron-builder afterPack 钩子：
// 在 Linux 打包目录生成 AppStream 元数据，版本号与日期跟随当前构建，无需手动维护。
// 时机：extraFiles 复制之后、target（AppImage/deb/rpm）构建之前，写入的文件会被一并打包。
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') {
    return
  }

  const version = context.packager.appInfo.version
  const date = new Date().toISOString().slice(0, 10)

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>wj-markdown-editor</id>
  <name>wj-markdown-editor</name>
  <summary>An open-source desktop Markdown editor</summary>
  <summary xml:lang="zh-CN">开源桌面端 Markdown 编辑器</summary>

  <metadata_license>MIT</metadata_license>
  <project_license>MIT</project_license>

  <description>
    <p>wj-markdown-editor is an open-source desktop Markdown editor for Windows and Linux. It offers a live preview with precise synchronized scrolling, formula and diagram rendering (KaTeX / Mermaid), GitHub alerts and custom containers, image and attachment insertion, image hosting upload, dark mode and custom themes, export to PDF / PNG / JPEG, and full-text search.</p>
  </description>

  <launchable type="desktop-id">wj-markdown-editor.desktop</launchable>

  <url type="homepage">https://github.com/nlbwqmz/wj-markdown-editor</url>
  <url type="bugtracker">https://github.com/nlbwqmz/wj-markdown-editor/issues</url>

  <screenshots>
    <screenshot type="default">
      <caption>Editing with live preview</caption>
      <image>https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/edit_done_dKVmHx.png</image>
    </screenshot>
    <screenshot>
      <caption>Preview mode</caption>
      <image>https://cdn.jsdelivr.net/gh/nlbwqmz/static-resource@main/image/preview_done_Lu_VHD.png</image>
    </screenshot>
  </screenshots>

  <categories>
    <category>Utility</category>
    <category>TextEditor</category>
  </categories>

  <keywords>
    <keyword>markdown</keyword>
    <keyword>editor</keyword>
    <keyword>preview</keyword>
  </keywords>

  <releases>
    <release version="${version}" date="${date}"/>
  </releases>
</component>
`

  const metainfoDir = path.join(context.appOutDir, 'usr', 'share', 'metainfo')
  fs.mkdirSync(metainfoDir, { recursive: true })
  fs.writeFileSync(path.join(metainfoDir, 'wj-markdown-editor.appdata.xml'), xml, 'utf8')
}
