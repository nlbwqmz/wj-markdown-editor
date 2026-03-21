import { createPreviewLayoutIndex } from '../../util/editor/previewLayoutIndexUtil.js'

/**
 * 在编辑页内统一创建并分发 previewLayoutIndex。
 * 这里只负责 composable 接线与索引重建，不接管 legacy 预览锚点 capture/restore。
 *
 * @param {{
 *   previewRef: { value: HTMLElement | null | undefined },
 *   usePreviewSync: (options: Record<string, any>) => Record<string, any>,
 *   previewSyncOptions: Record<string, any>,
 *   useAssociationHighlight: (options: Record<string, any>) => Record<string, any>,
 *   associationHighlightOptions: Record<string, any>,
 * }} options
 * @returns {{
 *   previewLayoutIndex: ReturnType<typeof createPreviewLayoutIndex>,
 *   rebuildPreviewLayoutIndex: () => number,
 *   previewSync: Record<string, any>,
 *   associationHighlight: Record<string, any>,
 * }} 返回索引实例、重建方法以及两个 composable 的结果。
 */
export function createMarkdownEditPreviewLayoutIndexWiring({
  previewRef,
  usePreviewSync,
  previewSyncOptions,
  useAssociationHighlight,
  associationHighlightOptions,
}) {
  const previewLayoutIndex = createPreviewLayoutIndex()

  function rebuildPreviewLayoutIndex() {
    return previewLayoutIndex.rebuild(previewRef.value)
  }

  const previewSync = usePreviewSync({
    ...previewSyncOptions,
    previewLayoutIndex,
  })

  const associationHighlight = useAssociationHighlight({
    ...associationHighlightOptions,
    previewLayoutIndex,
  })

  return {
    previewLayoutIndex,
    rebuildPreviewLayoutIndex,
    previewSync,
    associationHighlight,
  }
}
