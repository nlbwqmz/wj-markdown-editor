/**
 * 文档会话的类型（kind）。
 *
 * kind 属于文档会话，不属于标签页：标签页只是会话的视图外壳，
 * 一个标签页恒等于一个文档会话（见 docs/adr/0001）。
 *
 * 当前只落地 markdown；image / text 是计划中的类型，
 * 引入时在这里扩展枚举并补上对应的能力门控即可。
 */
export const DOCUMENT_SESSION_KIND = Object.freeze({
  MARKDOWN: 'markdown',
})

export const DEFAULT_DOCUMENT_SESSION_KIND = DOCUMENT_SESSION_KIND.MARKDOWN

const DOCUMENT_SESSION_KIND_SET = new Set(Object.values(DOCUMENT_SESSION_KIND))

/**
 * 把任意输入收敛成合法的会话类型。
 *
 * 未知取值一律回退到默认类型，避免历史 session 数据或未来新增类型
 * 在跨版本时把渲染层推到“没有类型”的分支上。
 */
export function normalizeDocumentSessionKind(kind) {
  return DOCUMENT_SESSION_KIND_SET.has(kind) ? kind : DEFAULT_DOCUMENT_SESSION_KIND
}

export default {
  DOCUMENT_SESSION_KIND,
  DEFAULT_DOCUMENT_SESSION_KIND,
  normalizeDocumentSessionKind,
}
