import {nanoid} from "nanoid";

const isOpenOnFile = () => {
  return Boolean(process.argv && process.argv.length > 0 && /.*\.md$/.test(process.argv[process.argv.length - 1]))
}
export default {
  debounce: (fn, delay = 300) => {
    let timer = null
    return function(...args) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        fn.apply(this, args)
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
  },
  isOpenOnFile,
  getOpenOnFilePath: () => {
    return isOpenOnFile() ? process.argv[process.argv.length - 1] : null
  },
  compareVersion: (version1, version2) => {
    const v1 = version1.split('.');
    const v2 = version2.split('.');
    for (let i = 0; i < v1.length || i < v2.length; ++i) {
      let x = 0, y = 0;
      if (i < v1.length) {
        x = parseInt(v1[i]);
      }
      if (i < v2.length) {
        y = parseInt(v2[i]);
      }
      if (x > y) {
        return 1;
      }
      if (x < y) {
        return -1;
      }
    }
    return 0;
  },
  createId: () => {
    return 'a' + nanoid()
  }
}
