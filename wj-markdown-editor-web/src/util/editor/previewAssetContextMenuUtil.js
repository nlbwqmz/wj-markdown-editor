/**
 * 获取预览资源右键菜单的弹层挂载节点
 * @returns {HTMLElement | undefined} 浏览器环境下返回 document.body
 */
export function getPreviewAssetPopupContainer() {
  if (typeof document === 'undefined') {
    return undefined
  }
  return document.body
}

export default {
  getPreviewAssetPopupContainer,
}
