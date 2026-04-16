import defaultConfig from '../defaultConfig.js'
import { validateConfigMutationRequest } from './configMutationSchema.js'
import { validateConfigShape } from './configSchema.js'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function createPathKey(path) {
  return path.map(item => String(item)).join('.')
}

function setByPath(target, path, value) {
  let current = target

  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]]

    if (!current) {
      throw new TypeError(`配置路径不存在: ${createPathKey(path)}`)
    }
  }

  current[path[path.length - 1]] = cloneValue(value)
}

export function applyConfigMutationRequest(currentConfig, request) {
  validateConfigMutationRequest(request)

  // mutation 必须产出新配置对象，避免原地修改当前内存配置。
  const nextConfig = cloneValue(currentConfig)

  for (const operation of request.operations) {
    if (operation.type === 'set') {
      setByPath(nextConfig, operation.path, operation.value)
      continue
    }

    if (operation.type === 'setShortcutKeyField') {
      const shortcutKey = nextConfig.shortcutKeyList.find(item => item.id === operation.id)

      if (!shortcutKey) {
        throw new TypeError(`未找到快捷键: ${operation.id}`)
      }

      shortcutKey[operation.field] = cloneValue(operation.value)
      continue
    }

    if (operation.type === 'setAutoSaveOption') {
      const optionSet = new Set(nextConfig.autoSave)

      if (operation.enabled) {
        optionSet.add(operation.option)
      } else {
        optionSet.delete(operation.option)
      }

      nextConfig.autoSave = Array.from(optionSet)
      continue
    }

    if (operation.type === 'reset') {
      const resetConfig = cloneValue(defaultConfig)
      validateConfigShape(resetConfig)
      return resetConfig
    }
  }

  // executor 返回前必须保证结果仍然是完整合法配置。
  validateConfigShape(nextConfig)
  return nextConfig
}
