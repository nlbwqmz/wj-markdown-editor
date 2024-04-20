export default {
  debounce: (fn, delay = 300) => {
    let timer = null
    return function () {
      timer && clearTimeout(timer)
      timer = setTimeout(() => {
        fn && fn()
      }, delay)
    }
  },
  deepCopy: obj => {
    return JSON.parse(JSON.stringify(obj))
  },
  setByKey: (source, target) => {
    for(const key in source){
      target[key] = source[key]
    }
  }
}
