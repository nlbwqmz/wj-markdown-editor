import pathUtil from "../util/pathUtil.js";
import fs from "fs";
import defaultConfig from "../util/defaultConfig.js";
import util from "../util/util.js";

const defaultConfigObj = defaultConfig.get()
const configPath = pathUtil.getConfigPath();
const handleList = []
const init = () => {
  return new Promise((resolve, reject) => {
    fs.access(configPath, fs.constants.F_OK, err => {
      if(err){
        fs.writeFile(configPath, JSON.stringify(defaultConfigObj), () => {})
        resolve(defaultConfigObj)
      } else {
        fs.readFile(pathUtil.getConfigPath(), (err, data) => {
          const config = JSON.parse(data.toString())
          let flag = false
          for(const key in defaultConfigObj){
            if(!config.hasOwnProperty(key)){
              flag = true
              config[key] = defaultConfigObj[key]
            }
          }
          if(flag){
            fs.writeFile(configPath, JSON.stringify(config), () => {})
          }
          resolve(config)
        })
      }
    })
  })
}
const config = await init()
const proxy = new Proxy(config, {
  get(target, name, receiver) {
    return target[name]
  },
  set(target, name, newValue, receiver) {
    if(target[name] !== newValue){
      target[name] = newValue
      util.debounce(() => {fs.writeFile(configPath, JSON.stringify(target), () => {})})()
      handleList.forEach(item => {
        if(!item.nameList || item.nameList.length === 0 ||item.nameList.indexOf(name) > -1){
          item.handle && item.handle(util.deepCopy(target))
        }
      })
    }
    return true
  }
})

export default proxy
export const configWatch = handle => {
  handleList.push(handle)
}
