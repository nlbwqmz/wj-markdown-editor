function createRecentMissingPromptController({
  prompt,
} = {}) {
  let lastPromptedPath = null

  // 只要当前不再处于 recent-missing 态，就必须清空去重基线。
  // 这样同一路径未来再次进入缺失态时，仍然允许重新提示。
  function reset() {
    lastPromptedPath = null
  }

  // 这里专门只做“是否需要提示”的判定，不碰任何视图状态。
  // EditorView 无论是收到 push snapshot，还是收到首屏 bootstrap 结果，
  // 都走同一套去重逻辑，避免把提示时机绑定到某一条链路上。
  function sync(snapshot) {
    const isRecentMissing = snapshot?.isRecentMissing === true
    const missingPath = typeof snapshot?.recentMissingPath === 'string' && snapshot.recentMissingPath
      ? snapshot.recentMissingPath
      : null

    if (!isRecentMissing || !missingPath) {
      reset()
      return false
    }

    if (lastPromptedPath === missingPath) {
      return false
    }

    lastPromptedPath = missingPath
    prompt?.(missingPath)
    return true
  }

  return {
    sync,
    reset,
  }
}

export {
  createRecentMissingPromptController,
}

export default {
  createRecentMissingPromptController,
}
