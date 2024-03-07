import router from '@/router'
import { message } from 'ant-design-vue'

export default {
  initMessageConfig: () => {
    message.config({
      top: '150px',
      duration: 2,
      maxCount: 3,
      rtl: true
    })
  },
  arrFindIndex: (arr, value) => {
    return arr.findIndex(item => item === value)
  },
  toggleView: () => {
    const path = router.currentRoute.value.path
    if (path === '/edit') {
      router.push({ path: '/preview' }).then(() => {})
    } else if (path === '/preview') {
      router.push({ path: '/edit' }).then(() => {})
    }
  },
  deepCopy: value => JSON.parse(JSON.stringify(value)),
  // 生成唯一锚点
  mdHeadingId: (_text, _level, index) => `heading-${index}`,
  debounce: (func, timeout = 300) => {
    let timer
    return (...args) => {
      clearTimeout(timer)
      timer = setTimeout(() => { func.apply(this, args) }, timeout)
    }
  }
}
