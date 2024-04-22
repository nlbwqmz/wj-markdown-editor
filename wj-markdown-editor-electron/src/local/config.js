import pathUtil from "../util/pathUtil.js";
import fs from "fs";
import defaultConfig from "../constant/defaultConfig.js";
import util from "../util/util.js";
import DataWatch from "../type/DataWatch.js";

const defaultConfigObj = defaultConfig.get()
const configPath = pathUtil.getConfigPath();
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

const config = new DataWatch(await init());
config.watch([], data => util.debounce(() => {fs.writeFile(configPath, JSON.stringify(data), () => {})})())
export default config
