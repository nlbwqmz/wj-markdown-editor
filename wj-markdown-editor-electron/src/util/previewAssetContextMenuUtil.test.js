import { describe, expect, it } from 'vitest'
import { getPreviewAssetPopupContainer } from '../../../wj-markdown-editor-web/src/util/editor/previewAssetContextMenuUtil.js'

describe('getPreviewAssetPopupContainer', () => {
  it('浏览器环境下应该返回 document.body', () => {
    const originalDocument = globalThis.document
    const body = { nodeName: 'BODY' }
    globalThis.document = { body }

    try {
      expect(getPreviewAssetPopupContainer()).toBe(body)
    } finally {
      globalThis.document = originalDocument
    }
  })
})
