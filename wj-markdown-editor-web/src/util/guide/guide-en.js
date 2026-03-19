import codeGuideImg from '@/assets/img/guide/Code.webp'
import containerGuideImg from '@/assets/img/guide/Container.webp'
import githubAlertGuideImg from '@/assets/img/guide/GithubAlert.webp'
import tableGuideImg from '@/assets/img/guide/Table.webp'
import textColorGuideImg from '@/assets/img/guide/TextColor.webp'

export default `
# Example

::: Tip
You can use toolbar shortcuts.
:::

## General Auto-completion

> [!Important] Tip
> Use \`/\` to activate.

| Category |                          Trigger Words                          |
| :------: | :-------------------------------------------------------------: |
|   Audio  |   ['audio', 'yp', 'yinpin', '音频', '!audio']   |
|   Video  |   ['video', 'sp', 'shipin', '视频', '!video']   |
|   Date   |           ['date', 'rq', 'riqi', '日期']           |
|   Time   |  ['datetime', 'sj', 'shijian', 'time', '时间']  |
|   Image  |          ['image', 'tp', 'tupian', '图片']          |
|   Link   |          ['link', 'lj', 'lianjie', '链接']          |
|   Color  |  ['color', 'text', 'ys', 'wzys', '文字颜色']   |

## Anchor Links

Headings generate anchors automatically. The recommended usage is to write the original heading text directly and let the renderer normalize the hash link for you.

### Unique Headings

\`\`\`markdown
## Quick Start
## 中文 / 标题
## 中文 / 标题+++

[Jump to Quick Start](<#Quick Start>)
[Jump to 中文 / 标题](<#中文 / 标题>)
[Jump to 中文 / 标题+++](<#中文 / 标题+++>)
\`\`\`

### Headings With Spaces or Symbols

\`\`\`markdown
## 中文   标题
## 中文 /  标题
## 中文  ---  标题-2
## 中文 /  标题-1-2

[Jump 1](<#中文   标题>)
[Jump 2](<#中文 /  标题>)
[Jump 3](<#中文  ---  标题-2>)
[Jump 4](<#中文 /  标题-1-2>)
\`\`\`

### Duplicate Headings

If the document contains duplicate headings, later headings receive suffixes such as \`-1\` and \`-2\`.  
In that case, you need to link to the generated anchor explicitly instead of using the original heading text only.

\`\`\`markdown
## Hello World
## Hello World

[Jump to the first heading](<#hello-world>)
[Jump to the second heading](<#hello-world-1>)
\`\`\`

### Notes

- Markdown links starting with \`#\` are normalized with the same base rules as heading anchors during rendering.
- The normalization rules are: trim leading and trailing spaces, convert to lowercase, collapse consecutive whitespace into a single \`-\`, and then URL-encode the result.
- You do not need to manually encode Chinese text, spaces, \`/\`, \`+\`, or similar characters.
- If you already wrote suffixes such as \`-1\` or \`-2\`, they are preserved and only encoded as part of the final anchor.

## Alert

### Syntax

> [!Note] Custom Title
> github alert.

::: Details Syntax
  \`\`\`markdown
  > [!Note] Custom Title
  > github alert.
  \`\`\`
:::

---

> [!tip]
> github alert.

::: Details Syntax
  \`\`\`markdown
  > [!tip]
  > github alert.
  \`\`\`
:::

---

> [!Important]
> github alert.

::: Details Syntax
  \`\`\`markdown
  > [!Important]
  > github alert.
  \`\`\`
:::

---

> [!Warning]
> github alert.

::: Details Syntax
  \`\`\`markdown
  > [!Warning]
  > github alert.
  \`\`\`
:::


--- 

> [!Caution]
> github alert.

::: Details Syntax
  \`\`\`markdown
  > [!Caution]
  > github alert.
  \`\`\`
:::

### Auto-completion

<img src="${githubAlertGuideImg}" alt="GithubAlert"/>

## Container

### Syntax

::: Info Custom Title
Container.
:::

:::: Details Syntax
  \`\`\`markdown
  ::: Info Custom Title
  Container.
  :::
  \`\`\`
::::

---

::: Tip
Container.
:::

:::: Details Syntax
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

:::: Details Syntax
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

:::: Details Syntax
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

:::: Details Syntax
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

:::: Details Syntax
  \`\`\`markdown
  ::: Details
  Container.
  :::
  \`\`\`
::::

### Auto-completion

<img src="${containerGuideImg}" alt="Container"/>

## Code Block

<img src="${codeGuideImg}" alt="Code"/>

## Table

<img src="${tableGuideImg}" alt="Table"/>

## Video

\`!video(link)\`

## Audio

\`!audio(link)\`

## Text Color

<img src="${textColorGuideImg}" alt="TextColor"/>

---

\`{red}(Red)\`

{red}(Red)

---

\`{linear-gradient(90deg, rgba(63, 84, 63, 1) 16%, rgba(255, 0, 115, 1) 70%)}(Gradient)\`

{linear-gradient(90deg, rgba(63, 84, 63, 1) 16%, rgba(255, 0, 115, 1) 70%)}(Gradient)

---

\`Welcome to use <u>{linear-gradient(90deg, rgba(21, 143, 21, 1) 5%, rgba(179, 39, 58, 1) 78%)}(**wj-markdown-editor**)</u>.\`

Welcome to use <u>{linear-gradient(90deg, rgba(21, 143, 21, 1) 5%, rgba(179, 39, 58, 1) 78%)}(**wj-markdown-editor**)</u>.

`
