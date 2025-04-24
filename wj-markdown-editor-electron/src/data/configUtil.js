import path from 'node:path'
import { app } from 'electron'
import fs from 'fs-extra'
import defaultConfig from './defaultConfig.js'

let config
let updateCallback

const documentsPath = app.isPackaged ? path.resolve(app.getPath('documents'), 'wj-markdown-editor') : app.getAppPath()
const configPath = path.resolve(documentsPath, 'config.json')

function validateConfig(configTemp, defaultConfigTemp) {
  // 添加最外层没有的key
  Object.keys(defaultConfigTemp).forEach((key) => {
    if (Object.keys(configTemp).includes(key) === false) {
      configTemp[key] = defaultConfigTemp[key]
    }
  })

  // 检查快捷键配置
  // 删除不存在的快捷键
  configTemp.shortcutKeyList = configTemp.shortcutKeyList.filter(item => defaultConfigTemp.shortcutKeyList.some(temp => temp.id === item.id))

  // 添加不存在的快捷键
  defaultConfigTemp.shortcutKeyList.forEach((item) => {
    if (configTemp.shortcutKeyList.some(temp => temp.id === item.id) === false) {
      configTemp.shortcutKeyList.push(item)
    }
  })

  // 修正快捷键index
  configTemp.shortcutKeyList.forEach((item) => {
    const defaultShortcutKey = defaultConfigTemp.shortcutKeyList.find(temp => temp.id === item.id)
    if (defaultShortcutKey) {
      item.index = defaultShortcutKey.index
    }
  })

  // 排序
  configTemp.shortcutKeyList.sort((a, b) => a.index - b.index)
}

export default {
  initConfig: async (callback) => {
    updateCallback = callback
    await fs.ensureDir(documentsPath)
    const defaultConfigTemp = JSON.parse(JSON.stringify(defaultConfig))
    try {
      if (await fs.pathExists(configPath)) {
        config = JSON.parse(await fs.readFile(configPath, 'utf-8'))
        validateConfig(config, defaultConfigTemp)
      } else {
        config = defaultConfigTemp
      }
    } catch {
      config = defaultConfigTemp
    } finally {
      await fs.writeFile(configPath, JSON.stringify(config), 'utf-8')
    }
  },
  getConfig: () => {
    return JSON.parse(JSON.stringify(config))
  },
  setConfig: async (data) => {
    for (const key in data) {
      config[key] = data[key]
    }
    await fs.writeFile(configPath, JSON.stringify(config), 'utf-8')
    updateCallback && updateCallback(JSON.parse(JSON.stringify(config)))
  },
  getDefaultConfig: () => {
    return JSON.parse(JSON.stringify(defaultConfig))
  },
}
