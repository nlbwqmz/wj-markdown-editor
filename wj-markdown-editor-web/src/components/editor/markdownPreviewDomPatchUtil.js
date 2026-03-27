const ELEMENT_NODE = 1

/**
 * 判断当前元素是否需要在同步属性前直接整节点替换。
 * 某些原生表单元素在属性更新顺序不稳定时，会触发浏览器的内建解析告警，
 * 例如 input 从 text 切到 number 时，会立刻尝试用旧 value 重新解析。
 *
 * @param {{ nodeType?: number, nodeName?: string, getAttribute?: Function } | null | undefined} oldNode
 * @param {{ nodeType?: number, nodeName?: string, getAttribute?: Function } | null | undefined} newNode
 * @returns {boolean} 返回是否应该跳过逐属性同步，直接替换为新节点。
 */
export function shouldReplaceElementBeforeAttributeSync(oldNode, newNode) {
  if (oldNode?.nodeType !== ELEMENT_NODE || newNode?.nodeType !== ELEMENT_NODE) {
    return false
  }

  const oldNodeName = String(oldNode.nodeName || '').toUpperCase()
  const newNodeName = String(newNode.nodeName || '').toUpperCase()
  if (!oldNodeName || oldNodeName !== newNodeName) {
    return false
  }

  // input 的 type 切换时，浏览器会用旧 value 立即参与新类型校验。
  // 这里直接替换节点，避免逐属性更新顺序触发原生告警。
  if (oldNodeName === 'INPUT') {
    return readAttributeValue(oldNode, 'type') !== readAttributeValue(newNode, 'type')
  }

  return false
}

/**
 * 安全读取节点属性值。
 *
 * @param {{ getAttribute?: Function } | null | undefined} node
 * @param {string} attributeName
 * @returns {string | null} 返回属性字符串；缺失时返回 null。
 */
function readAttributeValue(node, attributeName) {
  if (!node || typeof node.getAttribute !== 'function') {
    return null
  }

  const attributeValue = node.getAttribute(attributeName)
  return typeof attributeValue === 'string' ? attributeValue : null
}
