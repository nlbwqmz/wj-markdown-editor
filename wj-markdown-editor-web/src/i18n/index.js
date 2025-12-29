import { createI18n } from 'vue-i18n'
import enUS from './enUS.js'
import zhCN from './zhCN.js'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

export default i18n
