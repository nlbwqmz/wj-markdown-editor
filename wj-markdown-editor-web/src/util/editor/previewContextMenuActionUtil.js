/**
 * 根据预览上下文与菜单配置生成菜单项。
 *
 * @param {{ context?: { type?: string }, profile?: string, t?: (key: string) => string }} options
 * @returns {{ key: string, label: string, danger: boolean }[]} 返回预览资源菜单项列表。
 */
function buildPreviewContextMenuItems({ context, profile, t }) {
  if (context?.type !== 'resource') {
    return []
  }

  // 翻译函数允许注入，缺失时回退为直接返回文案 key。
  const translate = typeof t === 'function' ? t : key => key

  // 统一构造“打开所在目录”菜单项，避免不同 profile 下重复拼装。
  const openInFolderItem = {
    key: 'resource.open-in-folder',
    label: translate('top.openInExplorer'),
    danger: false,
  }

  if (profile === 'editor-preview') {
    return [
      openInFolderItem,
      {
        key: 'resource.delete',
        label: translate('previewAssetMenu.delete'),
        danger: true,
      },
    ]
  }

  if (profile === 'standalone-preview') {
    return [openInFolderItem]
  }

  return []
}

export {
  buildPreviewContextMenuItems,
}

export default {
  buildPreviewContextMenuItems,
}
