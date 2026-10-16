import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import SidebarPanel from '../SidebarPanel.vue'

const sidebarPanelState = vi.hoisted(() => ({
  store: {
    sidebarVisible: true,
    sidebarActiveTab: 'outline',
    documentSessionSnapshot: null,
    outlineActiveLine: null,
    outlineScrollContainer: null,
    outlineNavigateHandler: null,
    setSidebarActiveTab: vi.fn(),
  },
  parseOutlineFromMarkdown: vi.fn(() => []),
}))

sidebarPanelState.store = reactive(sidebarPanelState.store)

vi.mock('vue-i18n', () => ({
  useI18n() {
    return {
      t: key => key,
    }
  },
}))

vi.mock('@/stores/counter.js', () => ({
  useCommonStore() {
    return sidebarPanelState.store
  },
}))

vi.mock('@/util/editor/outlineParseUtil.js', () => ({
  parseOutlineFromMarkdown: sidebarPanelState.parseOutlineFromMarkdown,
}))

vi.mock('@/components/layout/FileManagerPanel.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'FileManagerPanelStub',
      setup() {
        return () => h('div', { 'data-testid': 'file-manager-panel-stub' })
      },
    }),
  }
})

vi.mock('@/components/editor/MarkdownMenu.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'MarkdownMenuStub',
      setup() {
        return () => h('div', { 'data-testid': 'markdown-menu-stub' })
      },
    }),
  }
})

const mountedWrapperList = []

function mountSidebarPanel() {
  const wrapper = mount(SidebarPanel)
  mountedWrapperList.push(wrapper)
  return wrapper
}

async function switchTab(wrapper, tabKey) {
  await wrapper.get(`[data-testid="sidebar-tab-${tabKey}"]`).trigger('click')
  await nextTick()
}

describe('sidebarPanel 面板挂载策略', () => {
  beforeEach(() => {
    sidebarPanelState.store.sidebarVisible = true
    sidebarPanelState.store.sidebarActiveTab = 'outline'
    sidebarPanelState.store.documentSessionSnapshot = null
    sidebarPanelState.store.outlineActiveLine = null
    sidebarPanelState.store.outlineScrollContainer = null
    sidebarPanelState.store.outlineNavigateHandler = null
    sidebarPanelState.store.setSidebarActiveTab.mockReset()
    sidebarPanelState.store.setSidebarActiveTab.mockImplementation((tab) => {
      sidebarPanelState.store.sidebarActiveTab = tab === 'outline' ? 'outline' : 'files'
    })
    sidebarPanelState.parseOutlineFromMarkdown.mockReset()
    sidebarPanelState.parseOutlineFromMarkdown.mockReturnValue([])
  })

  afterEach(() => {
    while (mountedWrapperList.length > 0) {
      mountedWrapperList.pop()?.unmount()
    }
    vi.clearAllMocks()
  })

  it('默认停留在大纲 tab 时应渲染 MarkdownMenu', async () => {
    const wrapper = mountSidebarPanel()
    await nextTick()

    expect(wrapper.find('[data-testid="markdown-menu-stub"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="sidebar-tab-outline"]').attributes('data-active')).toBe('true')
  })

  it('切到文件 tab 后应卸载 MarkdownMenu，同时保留 FileManagerPanel', async () => {
    const wrapper = mountSidebarPanel()
    await nextTick()

    await switchTab(wrapper, 'files')

    expect(wrapper.find('[data-testid="markdown-menu-stub"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="file-manager-panel-stub"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="sidebar-tab-files"]').attributes('data-active')).toBe('true')
  })

  it('切回大纲 tab 后应重新渲染 MarkdownMenu', async () => {
    const wrapper = mountSidebarPanel()
    await nextTick()

    await switchTab(wrapper, 'files')
    expect(wrapper.find('[data-testid="markdown-menu-stub"]').exists()).toBe(false)

    await switchTab(wrapper, 'outline')

    expect(wrapper.find('[data-testid="markdown-menu-stub"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="sidebar-tab-outline"]').attributes('data-active')).toBe('true')
  })

  it('切到大纲 tab 时文件面板只隐藏不卸载，搜索词与滚动位置得以保留', async () => {
    const wrapper = mountSidebarPanel()
    await nextTick()

    await switchTab(wrapper, 'files')
    const filePanelElement = wrapper.get('[data-testid="file-manager-panel-stub"]').element

    await switchTab(wrapper, 'outline')

    expect(wrapper.find('[data-testid="file-manager-panel-stub"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="file-manager-panel-stub"]').element).toBe(filePanelElement)
  })
})
