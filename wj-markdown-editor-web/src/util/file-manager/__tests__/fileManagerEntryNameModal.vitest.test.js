import { Modal } from 'ant-design-vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import FileManagerEntryNameInput from '@/components/layout/FileManagerEntryNameInput.vue'

// 冷启动加载 fileManagerPanelController 会连带拉入 ant-design-vue 等重依赖，
// 该耗时必须落在模块阶段与单个用例的宽松预算内，不能挤占默认 5000ms。
const FILE_MANAGER_PANEL_CONTROLLER_LOAD_TIMEOUT_MS = 60000
const fileManagerPanelControllerModulePromise = import('../fileManagerPanelController.js')

// 真实弹窗会挂到 body 上，用例结束后必须统一销毁，避免污染同文件后续用例。
afterEach(() => {
  Modal.destroyAll()
})

describe('createDefaultOpenNameInputModal', () => {
  it('弹窗应禁用确定按钮自动聚焦，并使用能响应输入的组件渲染内容', async () => {
    const { createDefaultOpenNameInputModal } = await fileManagerPanelControllerModulePromise
    const createModal = vi.fn()
    const showWarning = vi.fn()
    const openNameInputModal = createDefaultOpenNameInputModal({
      t: value => value,
      createModal,
      showWarning,
    })

    const resultPromise = openNameInputModal({
      kind: 'markdown',
      trim: true,
      emptyMessageKey: 'message.fileManagerMarkdownNameRequired',
    })

    expect(createModal).toHaveBeenCalledTimes(1)
    const modalConfig = createModal.mock.calls[0][0]
    // 确定按钮默认携带 autofocus 属性，会让浏览器拦截自动聚焦并输出控制台警告。
    expect(modalConfig.autoFocusButton).toBeNull()
    // content 必须是组件 vnode，才能在输入过程中重建 vnode 并保留输入法组合结果。
    expect(modalConfig.content.type).toBe(FileManagerEntryNameInput)
    expect(modalConfig.content.props.kind).toBe('markdown')

    modalConfig.content.props['onUpdate:value']('  draft-note  ')
    await expect(modalConfig.onOk()).resolves.toBe(true)
    await expect(resultPromise).resolves.toBe('draft-note.md')
  }, FILE_MANAGER_PANEL_CONTROLLER_LOAD_TIMEOUT_MS)

  it('名称为空时应提示错误且不结束弹窗', async () => {
    const { createDefaultOpenNameInputModal } = await fileManagerPanelControllerModulePromise
    const createModal = vi.fn()
    const showWarning = vi.fn()
    const openNameInputModal = createDefaultOpenNameInputModal({
      t: value => value,
      createModal,
      showWarning,
    })

    openNameInputModal({
      kind: 'folder',
      trim: true,
      emptyMessageKey: 'message.fileManagerFolderNameRequired',
    })

    const modalConfig = createModal.mock.calls[0][0]
    modalConfig.content.props['onUpdate:value']('   ')

    await expect(modalConfig.onOk()).rejects.toThrow('file-manager-entry-name-empty')
    expect(showWarning).toHaveBeenCalledWith('message.fileManagerFolderNameRequired')
  }, FILE_MANAGER_PANEL_CONTROLLER_LOAD_TIMEOUT_MS)

  it('真实弹窗打开后输入框应获得焦点，且输入框与确定按钮都不带 autofocus 属性', async () => {
    const { createDefaultOpenNameInputModal } = await fileManagerPanelControllerModulePromise
    const openNameInputModal = createDefaultOpenNameInputModal({
      t: value => value,
    })

    openNameInputModal({
      kind: 'markdown',
      trim: true,
      emptyMessageKey: 'message.fileManagerMarkdownNameRequired',
    })
    await nextTick()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()

    const input = document.querySelector('.ant-modal input')
    const okButton = document.querySelector('.ant-modal .ant-btn-primary')

    expect(input).not.toBeNull()
    // 输入框与确定按钮都不再依赖 DOM autofocus，浏览器不会拦截自动聚焦，控制台也不会再报警告。
    expect(input.hasAttribute('autofocus')).toBe(false)
    expect(okButton.hasAttribute('autofocus')).toBe(false)
    expect(document.activeElement).toBe(input)
  }, FILE_MANAGER_PANEL_CONTROLLER_LOAD_TIMEOUT_MS)
})
