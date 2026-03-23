import Ajv from 'ajv'

export const configSchema = {
  type: 'object',
  properties: {
    language: { enum: ['zh-CN', 'en-US'] },
    recentMax: { type: 'number', minimum: 0, maximum: 50 },
  },
}

const ajv = new Ajv({ allErrors: true })
const validateConfig = ajv.compile(configSchema)

export function validateConfigShape(config) {
  const valid = validateConfig(config)

  if (!valid) {
    // 将 schema 错误整合为单条异常，便于调用方直接上抛。
    const message = ajv.errorsText(validateConfig.errors, { separator: '; ' })
    throw new Error(`配置结构不合法: ${message}`)
  }
}
