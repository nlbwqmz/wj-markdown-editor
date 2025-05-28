import path from 'node:path'
import { app } from 'electron'
import fs from 'fs-extra'
import defaultConfig from './defaultConfig.js'

let config
let updateCallback

const documentsPath = app.isPackaged ? path.resolve(app.getPath('documents'), 'wj-markdown-editor') : app.getAppPath()
const configPath = path.resolve(documentsPath, 'config.json')

function mergeAndPrune(target, desc) {
  // 如果desc是基本类型，直接返回target（不覆盖）
  if (typeof desc !== 'object' || desc === null) {
    return target // 关键修改：不覆盖，保留原target值
  }

  // 处理数组
  if (Array.isArray(desc)) {
    // 如果target不是数组，直接返回target（不覆盖）
    if (!Array.isArray(target)) {
      return target // 关键修改：不覆盖，保留原target数组
    }

    // 遍历desc数组，递归合并，但不改变target数组的长度和已有元素的值
    const result = [...target] // 先复制原数组
    for (let i = 0; i < desc.length; i++) {
      if (i < result.length) {
        // 递归合并，但不覆盖已有值
        result[i] = mergeAndPrune(result[i], desc[i])
      } else {
        // 如果desc比target长，添加desc的新元素
        result.push(desc[i])
      }
    }
    return result
  }

  // 处理对象
  const result = { ...target } // 先复制原对象

  // 1. 删除target中存在但desc中不存在的属性
  for (const key in result) {
    if (!(key in desc)) {
      delete result[key]
    }
  }

  // 2. 添加desc中存在但target中不存在的属性（不覆盖已有属性）
  for (const key in desc) {
    if (!(key in result)) {
      result[key] = desc[key] // 直接添加新属性
    } else {
      // 递归处理嵌套对象
      result[key] = mergeAndPrune(result[key], desc[key])
    }
  }

  return result
}

function validateConfig(configTemp, defaultConfigTemp) {
  const result = mergeAndPrune(configTemp, defaultConfigTemp)

  // 检查快捷键配置
  // 删除不存在的快捷键
  result.shortcutKeyList = result.shortcutKeyList.filter(item => defaultConfigTemp.shortcutKeyList.some(temp => temp.id === item.id))

  // 添加不存在的快捷键
  defaultConfigTemp.shortcutKeyList.forEach((item) => {
    if (result.shortcutKeyList.some(temp => temp.id === item.id) === false) {
      result.shortcutKeyList.push(item)
    }
  })

  // 修正快捷键index
  result.shortcutKeyList.forEach((item) => {
    const defaultShortcutKey = defaultConfigTemp.shortcutKeyList.find(temp => temp.id === item.id)
    if (defaultShortcutKey) {
      item.index = defaultShortcutKey.index
    }
  })

  // 排序
  result.shortcutKeyList.sort((a, b) => a.index - b.index)

  // 修正预览主题名称
  if (result.theme.preview === 'github-light') {
    result.theme.preview = 'github'
  }

  return result
}

export default {
  initConfig: async (callback) => {
    updateCallback = callback
    await fs.ensureDir(documentsPath)
    const defaultConfigTemp = JSON.parse(JSON.stringify(defaultConfig))
    try {
      if (await fs.pathExists(configPath)) {
        config = validateConfig(JSON.parse(await fs.readFile(configPath, 'utf-8')), defaultConfigTemp)
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
