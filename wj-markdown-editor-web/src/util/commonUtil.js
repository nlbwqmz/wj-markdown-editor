import router from '@/router'
import { message } from 'ant-design-vue'
import { nanoid } from 'nanoid'
const getUrlParam = name => {
  if (router.currentRoute.value.query[name]) {
    return router.currentRoute.value.query[name]
  }
  const searchParams = new URL(window.location.href).searchParams
  return searchParams.get(name)
}
const createId = () => 'a' + nanoid()
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
      router.push({ path: '/preview', query: { id: getUrlParam('id') } }).then(() => {})
    } else if (path === '/preview') {
      router.push({ path: '/edit', query: { id: getUrlParam('id') } }).then(() => {})
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
  },
  getUrlParam,
  createId
}
