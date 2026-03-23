import assert from 'node:assert/strict'

const { test } = await import('node:test')

let settingConfigDraftUtilModule = null

try {
  settingConfigDraftUtilModule = await import('../settingConfigDraftUtil.js')
}
catch {
  settingConfigDraftUtilModule = null
}

function requireSettingConfigDraftUtil() {
  assert.ok(settingConfigDraftUtilModule, '缺少设置页配置草稿工具模块')

  const {
    applySelectableStringField,
    cloneConfigDraft,
    createTransportConfigUpdateFailureRecovery,
    normalizeRecentMaxInputValue,
    resolveConfigUpdateFailureRecovery,
  } = settingConfigDraftUtilModule

  assert.equal(typeof applySelectableStringField, 'function')
  assert.equal(typeof cloneConfigDraft, 'function')
  assert.equal(typeof createTransportConfigUpdateFailureRecovery, 'function')
  assert.equal(typeof normalizeRecentMaxInputValue, 'function')
  assert.equal(typeof resolveConfigUpdateFailureRecovery, 'function')

  return {
    applySelectableStringField,
    cloneConfigDraft,
    createTransportConfigUpdateFailureRecovery,
    normalizeRecentMaxInputValue,
    resolveConfigUpdateFailureRecovery,
  }
}

test('目录选择取消时不应覆盖本地字符串配置字段', () => {
  const { applySelectableStringField } = requireSettingConfigDraftUtil()
  const draftConfig = {
    imgAbsolutePath: 'D:/images',
  }

  const updated = applySelectableStringField(draftConfig, 'imgAbsolutePath', undefined)

  assert.equal(updated, false)
  assert.deepEqual(draftConfig, {
    imgAbsolutePath: 'D:/images',
  })
})

test('目录选择成功时应更新对应的本地字符串配置字段', () => {
  const { applySelectableStringField } = requireSettingConfigDraftUtil()
  const draftConfig = {
    fileAbsolutePath: 'D:/files',
  }

  const updated = applySelectableStringField(draftConfig, 'fileAbsolutePath', 'E:/next-files')

  assert.equal(updated, true)
  assert.deepEqual(draftConfig, {
    fileAbsolutePath: 'E:/next-files',
  })
})

test('配置提交失败时必须回滚本地草稿并忽略下一次同步', () => {
  const { resolveConfigUpdateFailureRecovery } = requireSettingConfigDraftUtil()
  const submissionGuard = {
    markNextSyncIgnoredCalled: 0,
    markNextSyncIgnored() {
      this.markNextSyncIgnoredCalled += 1
    },
  }
  const storeConfig = {
    language: 'zh-CN',
    theme: {
      global: 'light',
    },
  }

  const recovery = resolveConfigUpdateFailureRecovery({
    result: {
      ok: false,
      reason: 'config-invalid',
      messageKey: 'message.configInvalid',
    },
    storeConfig,
    submissionGuard,
  })

  assert.deepEqual(recovery, {
    messageKey: 'message.configInvalid',
    nextConfig: {
      language: 'zh-CN',
      theme: {
        global: 'light',
      },
    },
  })
  assert.equal(submissionGuard.markNextSyncIgnoredCalled, 1)
  assert.notEqual(recovery.nextConfig, storeConfig)
  assert.notEqual(recovery.nextConfig.theme, storeConfig.theme)
})

test('传输层失败时必须回滚本地草稿并回退到默认失败文案 key', () => {
  const { createTransportConfigUpdateFailureRecovery } = requireSettingConfigDraftUtil()
  const submissionGuard = {
    markNextSyncIgnoredCalled: 0,
    markNextSyncIgnored() {
      this.markNextSyncIgnoredCalled += 1
    },
  }
  const storeConfig = {
    imgAbsolutePath: 'D:/images',
    fileAbsolutePath: 'D:/files',
  }

  const recovery = createTransportConfigUpdateFailureRecovery({
    storeConfig,
    submissionGuard,
  })

  assert.deepEqual(recovery, {
    messageKey: 'message.configWriteFailed',
    nextConfig: {
      imgAbsolutePath: 'D:/images',
      fileAbsolutePath: 'D:/files',
    },
  })
  assert.equal(submissionGuard.markNextSyncIgnoredCalled, 1)
})

test('配置提交成功时不应触发草稿回滚', () => {
  const { resolveConfigUpdateFailureRecovery } = requireSettingConfigDraftUtil()
  const submissionGuard = {
    markNextSyncIgnoredCalled: 0,
    markNextSyncIgnored() {
      this.markNextSyncIgnoredCalled += 1
    },
  }

  const recovery = resolveConfigUpdateFailureRecovery({
    result: {
      ok: true,
    },
    storeConfig: {
      language: 'zh-CN',
    },
    submissionGuard,
  })

  assert.equal(recovery, null)
  assert.equal(submissionGuard.markNextSyncIgnoredCalled, 0)
})

test('recentMax 输入值必须被规范为 0 到 50 的整数', () => {
  const { normalizeRecentMaxInputValue } = requireSettingConfigDraftUtil()

  assert.equal(normalizeRecentMaxInputValue(null), 0)
  assert.equal(normalizeRecentMaxInputValue(undefined), 0)
  assert.equal(normalizeRecentMaxInputValue(Number.NaN), 0)
  assert.equal(normalizeRecentMaxInputValue(-1), 0)
  assert.equal(normalizeRecentMaxInputValue(0), 0)
  assert.equal(normalizeRecentMaxInputValue(7.9), 7)
  assert.equal(normalizeRecentMaxInputValue(12), 12)
  assert.equal(normalizeRecentMaxInputValue(51), 50)
})
