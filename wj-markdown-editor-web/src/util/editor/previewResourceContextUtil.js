function createPreviewResourceContext(assetInfo) {
  // 没有可识别资源地址时，直接返回空，避免后续菜单动作落到无效上下文上。
  if (!assetInfo?.resourceUrl) {
    return null
  }

  return {
    type: 'resource',
    asset: {
      kind: assetInfo.kind,
      rawSrc: assetInfo.rawSrc,
      rawPath: assetInfo.rawPath,
      resourceUrl: assetInfo.resourceUrl,
      occurrence: assetInfo.occurrence,
      lineStart: assetInfo.lineStart,
      lineEnd: assetInfo.lineEnd,
    },
    menuPosition: {
      x: assetInfo.clientX ?? 0,
      y: assetInfo.clientY ?? 0,
    },
  }
}

export {
  createPreviewResourceContext,
}

export default {
  createPreviewResourceContext,
}
