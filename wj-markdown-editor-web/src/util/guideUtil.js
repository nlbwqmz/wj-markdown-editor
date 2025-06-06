import codeGuideImg from '@/assets/img/guide/Code.webp'
import containerGuideImg from '@/assets/img/guide/Container.webp'
import githubAlertGuideImg from '@/assets/img/guide/GithubAlert.webp'
import tableGuideImg from '@/assets/img/guide/Table.webp'
import textColorGuideImg from '@/assets/img/guide/TextColor.webp'

const content = `
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

export default {
  getGuideContent: () => content,
}
