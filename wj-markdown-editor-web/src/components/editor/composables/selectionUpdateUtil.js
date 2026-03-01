/**
 * 判断本次选区更新是否由鼠标操作触发
 * 目的是避免在 pointer 选区过程中触发额外副作用，降低与编辑器内部 DOM 查询的竞态风险
 * @param {import('@codemirror/view').ViewUpdate | undefined | null} update
 * @returns {boolean}
 */
export function isPointerSelectionUpdate(update) {
  if (!update || !Array.isArray(update.transactions)) {
    return false
  }
  return update.transactions.some(transaction => transaction?.isUserEvent?.('select.pointer') === true)
}
