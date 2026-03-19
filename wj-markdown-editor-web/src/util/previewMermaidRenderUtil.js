/**
 * 等待本次预览中的 Mermaid 渲染完成。
 *
 * Mermaid 渲染失败时只记录日志，
 * 不能让预览刷新或导出链路一直挂住。
 *
 * @param {{
 *   nodes?: ArrayLike<HTMLElement> | null,
 *   runMermaid?: (options: { nodes: ArrayLike<HTMLElement> }) => Promise<void>,
 *   logError?: (message: string, error: unknown) => void,
 * }} options
 * @returns {Promise<void>}
 */
export async function settleMermaidRender(options = {}) {
  const {
    nodes,
    runMermaid,
    logError = (message, error) => {
      console.error(message, error)
    },
  } = options

  const mermaidNodes = Array.from(nodes || [])
  if (mermaidNodes.length === 0 || typeof runMermaid !== 'function') {
    return
  }

  try {
    await runMermaid({
      nodes: mermaidNodes,
    })
  } catch (error) {
    logError('[Preview] Mermaid 渲染失败，继续后续流程', error)
  }
}

export default {
  settleMermaidRender,
}
