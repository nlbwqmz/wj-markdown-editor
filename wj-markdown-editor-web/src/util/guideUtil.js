import guideEn from './guide/guide-en.js'
import guideZh from './guide/guide-zh.js'

const guideContentMap = {
  'zh-CN': guideZh,
  'en-US': guideEn,
}

export default {
  getGuideContent: (locale = 'zh-CN') => {
    return guideContentMap[locale] || guideContentMap['zh-CN']
  },
}