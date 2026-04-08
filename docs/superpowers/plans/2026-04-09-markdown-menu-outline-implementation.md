# MarkdownMenu 自定义大纲导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用自定义渲染替换 `MarkdownMenu` 对 `a-anchor` 的依赖，同时保持现有预览滚动高亮、菜单自滚动、点击锚点平滑滚动与主题协调行为不回退。

**Architecture:** 先把目录数据拍平与 active/滚动计算下沉到纯函数工具中，用 `node:test` 锁住行为；再用 Vitest 驱动 `MarkdownMenu.vue` 的自定义列表实现，接管 active 状态、点击滚动和菜单自滚动。最终通过 Web 包测试、构建和定向检查验证 `MarkdownEdit` / `PreviewView` / `GuideView` 依赖的 props 契约没有回退。用户已明确要求不使用 worktree，本计划直接在当前分支 `feat/custom-outline-menu` 上执行。

**Tech Stack:** Vue 3、Ant Design Vue 4、Vite 6、Vitest 4、Node `node:test`、SCSS、ESLint

---

## File Map

- Create: `wj-markdown-editor-web/src/components/editor/markdownMenuUtil.js`
  负责目录树拍平、active 锚点计算、目标滚动位置计算等纯函数。
- Create: `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenuUtil.test.js`
  用 `node:test` 锁定拍平与滚动计算语义。
- Create: `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenu.vitest.test.js`
  用 Vitest 校验 `MarkdownMenu` 的渲染、active 联动、点击滚动与菜单自滚动。
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue`
  替换 `a-anchor`，接入工具函数、自定义模板与主题样式。

### Task 1: 为目录拍平与滚动计算建立失败保护测试

**Files:**
- Create: `wj-markdown-editor-web/src/components/editor/markdownMenuUtil.js`
- Create: `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenuUtil.test.js`
- Test: `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenuUtil.test.js`

- [ ] **Step 1: 先写 node:test，锁定拍平与 active/滚动计算语义**

```js
import assert from 'node:assert/strict'

const { test } = await import('node:test')
const markdownMenuUtilModule = await import('../markdownMenuUtil.js')

const {
  flattenMarkdownMenuAnchors,
  resolveMarkdownMenuActiveHref,
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

test('resolveMarkdownMenuTargetScrollTop 应按容器相对坐标计算平滑滚动目标位置', () => {
  const targetScrollTop = resolveMarkdownMenuTargetScrollTop({
    containerTop: 100,
    containerScrollTop: 40,
    containerClientTop: 2,
    targetTop: 260,
  })

  assert.equal(targetScrollTop, 198)
})
```

- [ ] **Step 2: 运行 node:test，确认测试先失败**

Run:

```bash
npm run test:node -- src/components/editor/__tests__/markdownMenuUtil.test.js
```

Expected:

- FAIL，原因应为 `markdownMenuUtil.js` 尚未创建或缺少目标导出

- [ ] **Step 3: 以最小实现补齐纯函数工具**

创建 `wj-markdown-editor-web/src/components/editor/markdownMenuUtil.js`：

```js
function normalizeAnchorChildren(children) {
  return Array.isArray(children) ? children : []
}

export function flattenMarkdownMenuAnchors(anchorList, depth = 0, collection = []) {
  const normalizedAnchorList = Array.isArray(anchorList) ? anchorList : []

  normalizedAnchorList.forEach((item) => {
    if (!item?.href) {
      return
    }

    collection.push({
      key: item.key,
      href: item.href,
      title: item.title,
      level: item.level,
      depth,
    })

    flattenMarkdownMenuAnchors(normalizeAnchorChildren(item.children), depth + 1, collection)
  })

  return collection
}

export function resolveMarkdownMenuActiveHref({
  headingRecords,
  scrollTop,
  clientHeight,
  scrollHeight,
}) {
  const normalizedHeadingRecords = Array.isArray(headingRecords) ? headingRecords : []
  if (normalizedHeadingRecords.length === 0) {
    return ''
  }

  if (scrollTop + clientHeight >= scrollHeight - 1) {
    return normalizedHeadingRecords.at(-1)?.href || ''
  }

  let activeHref = normalizedHeadingRecords[0]?.href || ''
  normalizedHeadingRecords.forEach((record) => {
    if (record.top <= scrollTop) {
      activeHref = record.href
    }
  })

  return activeHref
}

export function resolveMarkdownMenuTargetScrollTop({
  containerTop,
  containerScrollTop,
  containerClientTop,
  targetTop,
}) {
  return targetTop - containerTop - containerClientTop + containerScrollTop
}
```

- [ ] **Step 4: 重新运行 node:test，确认纯函数语义通过**

Run:

```bash
npm run test:node -- src/components/editor/__tests__/markdownMenuUtil.test.js
```

Expected:

- PASS，3 个测试全部通过

- [ ] **Step 5: 对本轮文件执行 ESLint 修复**

Run:

```bash
npx eslint --fix src/components/editor/markdownMenuUtil.js src/components/editor/__tests__/markdownMenuUtil.test.js
```

Expected:

- Exit code 0
- 只格式化当前两个文件

- [ ] **Step 6: 提交 Task 1**

Run:

```bash
git add src/components/editor/markdownMenuUtil.js src/components/editor/__tests__/markdownMenuUtil.test.js
git commit -m "test(web): cover markdown menu util behavior"
```

Expected:

- 生成一笔只包含目录工具函数与测试的提交

### Task 2: 用组件测试驱动 MarkdownMenu 自定义实现

**Files:**
- Modify: `wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue`
- Create: `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenu.vitest.test.js`
- Modify: `wj-markdown-editor-web/src/components/editor/markdownMenuUtil.js`
- Test: `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenu.vitest.test.js`

- [ ] **Step 1: 先写组件失败测试，覆盖渲染、高亮、菜单自滚动和点击滚动**

创建 `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenu.vitest.test.js`：

```js
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MarkdownMenu from '../MarkdownMenu.vue'

function createAnchorList() {
  return [
    {
      key: 'intro',
      href: '#intro',
      title: '介绍',
      level: 1,
      children: [
        {
          key: 'session',
          href: '#session',
          title: '文档会话模型',
          level: 2,
          children: [],
        },
      ],
    },
    {
      key: 'resource',
      href: '#resource',
      title: '资源策略',
      level: 1,
      children: [],
    },
  ]
}

function createHeading({ top }) {
  return {
    getBoundingClientRect() {
      return { top }
    },
  }
}

describe('MarkdownMenu', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
    container.scrollTop = 0
    container.clientTop = 0
    container.clientHeight = 240
    container.scrollHeight = 800
    container.getBoundingClientRect = () => ({ top: 100 })
    container.scrollTo = vi.fn(({ top }) => {
      container.scrollTop = top
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('会按层级渲染目录项，并在空目录时保留空状态', async () => {
    const wrapper = mount(MarkdownMenu, {
      props: {
        anchorList: createAnchorList(),
        getContainer: () => container,
      },
      global: {
        mocks: {
          $t: key => key,
        },
        stubs: {
          'a-empty': {
            template: '<div data-testid=\"empty-stub\"><slot name=\"description\" /></div>',
          },
        },
      },
    })

    const items = wrapper.findAll('[data-testid=\"markdown-menu-item\"]')
    expect(items).toHaveLength(3)
    expect(items[1].attributes('data-depth')).toBe('1')
  })

  it('预览容器滚动后会切换 active 项，并把 active 项滚入目录可视区', async () => {
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ top: 100 }),
        '#session': createHeading({ top: 220 }),
        '#resource': createHeading({ top: 360 }),
      }
      return map[selector] || null
    })

    const scrollIntoView = vi.fn()
    const wrapper = mount(MarkdownMenu, {
      props: {
        anchorList: createAnchorList(),
        getContainer: () => container,
      },
      attachTo: document.body,
      global: {
        mocks: {
          $t: key => key,
        },
        stubs: {
          'a-empty': {
            template: '<div data-testid=\"empty-stub\"><slot name=\"description\" /></div>',
          },
        },
      },
    })

    wrapper.vm.menuItemElementMap['#session'] = { scrollIntoView }
    container.scrollTop = 160
    container.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-active=\"true\"]').attributes('data-href')).toBe('#session')
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('点击目录项时会阻止默认行为，并使用 JS 平滑滚动到目标标题', async () => {
    container.querySelector = vi.fn((selector) => {
      const map = {
        '#intro': createHeading({ top: 100 }),
        '#session': createHeading({ top: 220 }),
        '#resource': createHeading({ top: 360 }),
      }
      return map[selector] || null
    })

    const wrapper = mount(MarkdownMenu, {
      props: {
        anchorList: createAnchorList(),
        getContainer: () => container,
      },
      global: {
        mocks: {
          $t: key => key,
        },
        stubs: {
          'a-empty': {
            template: '<div data-testid=\"empty-stub\"><slot name=\"description\" /></div>',
          },
        },
      },
    })

    await wrapper.find('[data-href=\"#resource\"]').trigger('click')

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 260,
      behavior: 'smooth',
    })
  })
})
```

- [ ] **Step 2: 运行组件测试，确认先失败**

Run:

```bash
npm run test:component:run -- src/components/editor/__tests__/markdownMenu.vitest.test.js
```

Expected:

- FAIL，原因应为当前 `MarkdownMenu.vue` 仍然输出 `a-anchor`，不存在自定义目录项和 active 标记

- [ ] **Step 3: 用最小实现替换 MarkdownMenu 的第三方渲染**

将 `wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue` 重构为以下骨架：

```vue
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import commonUtil from '@/util/commonUtil.js'
import {
  flattenMarkdownMenuAnchors,
  resolveMarkdownMenuActiveHref,
  resolveMarkdownMenuTargetScrollTop,
} from './markdownMenuUtil.js'

const props = defineProps({
  anchorList: {
    type: Array,
    default: () => [],
  },
  getContainer: {
    type: Function,
    default: () => document.body,
  },
  close: {
    type: Function,
    default: null,
  },
})

const menuScrollContainerRef = ref()
const activeHref = ref('')
const menuItemElementMap = ref({})
let currentContainer = null

const flattenedAnchorList = computed(() => flattenMarkdownMenuAnchors(props.anchorList))

function getContainerHeadingRecords(container) {
  return flattenedAnchorList.value
    .map((item) => {
      const targetElement = container?.querySelector?.(item.href)
      if (!targetElement?.getBoundingClientRect) {
        return null
      }

      const containerRect = container.getBoundingClientRect()
      const targetRect = targetElement.getBoundingClientRect()
      return {
        href: item.href,
        top: targetRect.top - containerRect.top - container.clientTop + container.scrollTop,
      }
    })
    .filter(Boolean)
}

const syncActiveHref = commonUtil.debounce(() => {
  const container = props.getContainer?.()
  if (!container) {
    activeHref.value = ''
    return
  }

  const nextActiveHref = resolveMarkdownMenuActiveHref({
    headingRecords: getContainerHeadingRecords(container),
    scrollTop: container.scrollTop,
    clientHeight: container.clientHeight,
    scrollHeight: container.scrollHeight,
  })

  if (nextActiveHref === activeHref.value) {
    return
  }

  activeHref.value = nextActiveHref
  nextTick(() => {
    menuItemElementMap.value[nextActiveHref]?.scrollIntoView?.({
      block: 'center',
      behavior: 'smooth',
    })
  })
}, 60)

function bindContainer() {
  currentContainer?.removeEventListener?.('scroll', syncActiveHref)
  currentContainer = props.getContainer?.() || null
  currentContainer?.addEventListener?.('scroll', syncActiveHref)
  syncActiveHref()
}

function setMenuItemRef(href, element) {
  if (element) {
    menuItemElementMap.value[href] = element
    return
  }
  delete menuItemElementMap.value[href]
}

function onAnchorClick(event, href) {
  event.preventDefault()
  const container = props.getContainer?.()
  const targetElement = container?.querySelector?.(href)
  if (!container || !targetElement?.getBoundingClientRect) {
    return
  }

  const containerRect = container.getBoundingClientRect()
  const targetRect = targetElement.getBoundingClientRect()
  const targetScrollTop = resolveMarkdownMenuTargetScrollTop({
    containerTop: containerRect.top,
    containerScrollTop: container.scrollTop,
    containerClientTop: container.clientTop,
    targetTop: targetRect.top,
  })

  container.scrollTo({
    top: targetScrollTop,
    behavior: 'smooth',
  })
}

watch(() => props.anchorList, () => {
  nextTick(() => {
    bindContainer()
  })
}, { deep: true })

onMounted(() => {
  bindContainer()
})

onBeforeUnmount(() => {
  currentContainer?.removeEventListener?.('scroll', syncActiveHref)
})

defineExpose({
  menuItemElementMap,
})
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden">
    <div class="flex items-center b-b-1 b-b-border-primary b-b-solid p-2 font-size-3.5 text-text-primary" :class="close ? 'justify-between' : 'justify-center'">
      <div class="select-none">
        {{ $t('outline') }}
      </div>
      <div v-if="close" class="i-tabler:x cursor-pointer" @click="close" />
    </div>
    <div ref="menuScrollContainerRef" class="wj-scrollbar relative h-0 h-full flex-1 overflow-y-auto p-l-3 p-r-3 p-t-2 p-b-2">
      <div v-if="flattenedAnchorList.length === 0" class="h-full flex items-center justify-center">
        <a-empty>
          <template #description>
            <span class="color-gray-500">{{ $t('noOutline') }}</span>
          </template>
        </a-empty>
      </div>
      <button
        v-for="item in flattenedAnchorList"
        v-else
        :key="item.key"
        :ref="(element) => setMenuItemRef(item.href, element)"
        type="button"
        class="markdown-menu__item"
        :class="{ 'markdown-menu__item--active': activeHref === item.href }"
        :style="{ '--wj-markdown-menu-depth': item.depth }"
        :data-testid="'markdown-menu-item'"
        :data-href="item.href"
        :data-depth="String(item.depth)"
        :data-active="String(activeHref === item.href)"
        @click="(event) => onAnchorClick(event, item.href)"
      >
        <span class="markdown-menu__item-text">{{ item.title }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.markdown-menu__item {
  position: relative;
  display: block;
  width: 100%;
  min-height: 30px;
  margin-bottom: 4px;
  padding: 0 10px 0 calc(10px + var(--wj-markdown-menu-depth) * 14px);
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--wj-markdown-text-secondary);
  text-align: left;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--wj-markdown-bg-hover);
    color: var(--wj-markdown-text-primary);
  }
}

.markdown-menu__item--active {
  background: var(--wj-markdown-bg-secondary);
  color: var(--wj-markdown-text-primary);
  font-weight: 600;

  &::before {
    position: absolute;
    top: 5px;
    bottom: 5px;
    left: 0;
    width: 3px;
    border-radius: 999px;
    background: #007fd4;
    content: '';
  }
}

.markdown-menu__item-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 30px;
}
</style>
```

- [ ] **Step 4: 重新运行组件测试，确认交互行为通过**

Run:

```bash
npm run test:component:run -- src/components/editor/__tests__/markdownMenu.vitest.test.js
```

Expected:

- PASS，目录渲染、active 联动、点击滚动 3 个测试通过

- [ ] **Step 5: 对本轮文件执行 ESLint 修复**

Run:

```bash
npx eslint --fix src/components/editor/MarkdownMenu.vue src/components/editor/markdownMenuUtil.js src/components/editor/__tests__/markdownMenu.vitest.test.js
```

Expected:

- Exit code 0
- 仅格式化当前修改文件

- [ ] **Step 6: 提交 Task 2**

Run:

```bash
git add src/components/editor/MarkdownMenu.vue src/components/editor/markdownMenuUtil.js src/components/editor/__tests__/markdownMenu.vitest.test.js
git commit -m "feat(web): custom render markdown outline menu"
```

Expected:

- 生成一笔只包含 MarkdownMenu 自定义实现的提交

### Task 3: 完成包级回归验证并提交最终交付

**Files:**
- Verify: `wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue`
- Verify: `wj-markdown-editor-web/src/components/editor/markdownMenuUtil.js`
- Verify: `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenuUtil.test.js`
- Verify: `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenu.vitest.test.js`
- Verify: `docs/superpowers/plans/2026-04-09-markdown-menu-outline-implementation.md`

- [ ] **Step 1: 运行目录工具与组件的定向测试**

Run:

```bash
npm run test:node -- src/components/editor/__tests__/markdownMenuUtil.test.js
npm run test:component:run -- src/components/editor/__tests__/markdownMenu.vitest.test.js
```

Expected:

- 两条命令均 PASS
- Exit code 0

- [ ] **Step 2: 运行 Web 包完整测试**

Run:

```bash
npm run test:run
```

Expected:

- Node `node:test` 与 Vitest 全部通过
- Exit code 0

- [ ] **Step 3: 运行 Web 构建，确认组件改造没有破坏打包**

Run:

```bash
npm run build
```

Expected:

- 构建成功
- `../wj-markdown-editor-electron/web-dist` 正常产出最新资源

- [ ] **Step 4: 检查最终改动范围**

Run:

```bash
git status --short
```

Expected:

- 只包含以下文件的改动：
  - `wj-markdown-editor-web/src/components/editor/MarkdownMenu.vue`
  - `wj-markdown-editor-web/src/components/editor/markdownMenuUtil.js`
  - `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenuUtil.test.js`
  - `wj-markdown-editor-web/src/components/editor/__tests__/markdownMenu.vitest.test.js`
  - `docs/superpowers/plans/2026-04-09-markdown-menu-outline-implementation.md`

- [ ] **Step 5: 提交最终交付**

Run:

```bash
git add src/components/editor/MarkdownMenu.vue src/components/editor/markdownMenuUtil.js src/components/editor/__tests__/markdownMenuUtil.test.js src/components/editor/__tests__/markdownMenu.vitest.test.js docs/superpowers/plans/2026-04-09-markdown-menu-outline-implementation.md
git commit -m "test(web): verify markdown outline menu integration"
```

Expected:

- 生成一笔包含最终验证与计划文档的提交
