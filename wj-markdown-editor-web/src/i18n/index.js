import { createI18n } from 'vue-i18n'
import { resolveLanguagePreference } from '@/util/languagePreferenceUtil.js'
import enUS from './enUS.js'
import zhCN from './zhCN.js'

const i18n = createI18n({
  legacy: false,
  // 配置加载前先按系统语言展示，避免首屏语言与配置不一致
  locale: resolveLanguagePreference('auto', navigator.language),
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

export default i18n
