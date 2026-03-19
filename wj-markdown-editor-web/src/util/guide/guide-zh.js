import codeGuideImg from '@/assets/img/guide/Code.webp'
import containerGuideImg from '@/assets/img/guide/Container.webp'
import githubAlertGuideImg from '@/assets/img/guide/GithubAlert.webp'
import tableGuideImg from '@/assets/img/guide/Table.webp'
import textColorGuideImg from '@/assets/img/guide/TextColor.webp'

export default `
# 示例

::: Tip
可使用工具栏快捷操作。
:::

## 通用自动完成

> [!Important] 提示
> 需要使用\`/\`激活。

|   类别   |                    提示词                     |
| :------: | :-------------------------------------------: |
|   音频   |  ['audio', 'yp', 'yinpin', '音频', '!audio']  |
|   视频   |  ['video', 'sp', 'shipin', '视频', '!video']  |
|   日期   |        ['date', 'rq', 'riqi', '日期']         |
|   时间   | ['datetime', 'sj', 'shijian', 'time', '时间'] |
|   图片   |       ['image', 'tp', 'tupian', '图片']       |
|   链接   |       ['link', 'lj', 'lianjie', '链接']       |
| 文字颜色 |  ['color', 'text', 'ys', 'wzys', '文字颜色']  |

## 锚点链接

支持为标题自动生成锚点。推荐写法是直接写标题原文，不要手动做 URL 编码。

### 唯一标题

\`\`\`markdown
## 快速开始
## 中文 / 标题
## 中文 / 标题+++

[跳转到快速开始](<#快速开始>)
[跳转到中文 / 标题](<#中文 / 标题>)
[跳转到中文 / 标题+++](<#中文 / 标题+++>)
\`\`\`

### 包含空格或符号的标题

\`\`\`markdown
## 中文   标题
## 中文 /  标题
## 中文  ---  标题-2
## 中文 /  标题-1-2

[跳转 1](<#中文   标题>)
[跳转 2](<#中文 /  标题>)
[跳转 3](<#中文  ---  标题-2>)
[跳转 4](<#中文 /  标题-1-2>)
\`\`\`

### 重复标题

如果文档里有同名标题，后面的标题会自动追加 \`-1\`、\`-2\` 等后缀。  
这类场景需要显式写生成后的锚点，不能只写标题原文。

\`\`\`markdown
## Hello World
## Hello World

[跳转到第一个标题](<#hello-world>)
[跳转到第二个标题](<#hello-world-1>)
\`\`\`

### 说明

- 以 \`#\` 开头的 Markdown 链接会在渲染时自动按标题锚点规则规范化。
- 规范化规则为：去掉首尾空白、转小写、连续空白折叠为一个 \`-\`，最后再做 URL 编码。
- 中文、空格、\`/\`、\`+\` 等字符都不需要手动编码。
- 如果你已经手动写了 \`-1\`、\`-2\` 这类后缀，链接会按原样参与编码，不会额外推断编号。

## 提示

### 语法

> [!Note] 自定义标题
> github alert.

::: Details 语法
  \`\`\`markdown
  > [!Note] 自定义标题
  > github alert.
  \`\`\`
:::

---

> [!tip]
> github alert.

::: Details 语法
  \`\`\`markdown
  > [!tip]
  > github alert.
  \`\`\`
:::

---

> [!Important]
> github alert.

::: Details 语法
  \`\`\`markdown
  > [!Important]
  > github alert.
  \`\`\`
:::

---

> [!Warning]
> github alert.

::: Details 语法
  \`\`\`markdown
  > [!Warning]
  > github alert.
  \`\`\`
:::


--- 

> [!Caution]
> github alert.

::: Details 语法
  \`\`\`markdown
  > [!Caution]
  > github alert.
  \`\`\`
:::

### 自动完成

<img src="${githubAlertGuideImg}" alt="GithubAlert"/>

## 容器

### 语法

::: Info 自定义标题
Container.
:::

:::: Details 语法
  \`\`\`markdown
  ::: Info 自定义标题
  Container.
  :::
  \`\`\`
::::

---

::: Tip
Container.
:::

:::: Details 语法
  \`\`\`markdown
  ::: Tip
  Container.
  :::
  \`\`\`
::::

---

::: Important
Container.
:::

:::: Details 语法
  \`\`\`markdown
  ::: Important
  Container.
  :::
  \`\`\`
::::

---

::: Warning
Container.
:::

:::: Details 语法
  \`\`\`markdown
  ::: Warning
  Container.
  :::
  \`\`\`
::::

---

::: Danger
Container.
:::

:::: Details 语法
  \`\`\`markdown
  ::: Danger
  Container.
  :::
  \`\`\`
::::

---

::: Details
Container.
:::

:::: Details 语法
  \`\`\`markdown
  ::: Details
  Container.
  :::
  \`\`\`
::::

### 自动完成

<img src="${containerGuideImg}" alt="Container"/>

## 代码块

<img src="${codeGuideImg}" alt="Code"/>

## 表格

<img src="${tableGuideImg}" alt="Table"/>

## 视频

\`!video(链接)\`

## 音频

\`!audio(链接)\`

## 文字颜色

<img src="${textColorGuideImg}" alt="TextColor"/>

---

\`{red}(红色)\`

{red}(红色)

---

\`{linear-gradient(90deg, rgba(63, 84, 63, 1) 16%, rgba(255, 0, 115, 1) 70%)}(渐变色)\`

{linear-gradient(90deg, rgba(63, 84, 63, 1) 16%, rgba(255, 0, 115, 1) 70%)}(渐变色)

---

\`欢迎大家使用<u>{linear-gradient(90deg, rgba(21, 143, 21, 1) 5%, rgba(179, 39, 58, 1) 78%)}(**wj-markdown-editor**)</u>编辑器。\`

欢迎大家使用<u>{linear-gradient(90deg, rgba(21, 143, 21, 1) 5%, rgba(179, 39, 58, 1) 78%)}(**wj-markdown-editor**)</u>编辑器。

`
