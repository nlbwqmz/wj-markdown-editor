function cloneValue(value) {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value
  }

  return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function clampNumber(value, schema) {
  let nextValue = value

  if (typeof schema.minimum === 'number' && nextValue < schema.minimum) {
    nextValue = schema.minimum
  }

  if (typeof schema.maximum === 'number' && nextValue > schema.maximum) {
    nextValue = schema.maximum
  }

  return nextValue
}

function normalizeNumericValue(value, schema) {
  const clampedValue = clampNumber(value, schema)
  if (schema.type === 'integer') {
    return Math.floor(clampedValue)
  }

  return clampedValue
}

function sanitizeScalar(value, defaultValue, schema) {
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    return value === schema.const ? value : cloneValue(defaultValue)
  }

  if (Array.isArray(schema.enum)) {
    return schema.enum.includes(value) ? value : cloneValue(defaultValue)
  }

  if (schema.type === 'string') {
    return typeof value === 'string' ? value : cloneValue(defaultValue)
  }

  if (schema.type === 'boolean') {
    return typeof value === 'boolean' ? value : cloneValue(defaultValue)
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || Number.isFinite(value) === false) {
      return cloneValue(defaultValue)
    }

    return normalizeNumericValue(value, schema)
  }

  return cloneValue(defaultValue)
}

function isFixedLengthArraySchema(schema, defaultValue) {
  return typeof schema.minItems === 'number'
    && typeof schema.maxItems === 'number'
    && schema.minItems === schema.maxItems
    && Array.isArray(defaultValue)
    && defaultValue.length === schema.minItems
}

function getDefaultArrayItem(value, defaultArray, index) {
  if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, 'id')) {
    const matchedDefaultItem = defaultArray.find(item => isPlainObject(item) && item.id === value.id)
    if (matchedDefaultItem !== undefined) {
      return matchedDefaultItem
    }

    // 带 id 的对象项必须按 id 对齐默认值；未命中时不能再借用同下标默认项。
    return undefined
  }

  return index < defaultArray.length ? defaultArray[index] : undefined
}

function isSanitizedArrayItemComplete(value, schema) {
  if (schema?.type !== 'object') {
    return value !== undefined
  }

  if (isPlainObject(value) === false) {
    return false
  }

  const properties = schema.properties || {}

  // 默认项缺失时，对象数组修复后若仍有字段未成形，就直接丢弃，避免留下半成品对象。
  return Object.keys(properties).every(key => value[key] !== undefined)
}

function sanitizeArray(value, defaultValue, schema) {
  const defaultArray = Array.isArray(defaultValue) ? defaultValue : []
  if (Array.isArray(value) === false) {
    return cloneValue(defaultArray)
  }

  if (isFixedLengthArraySchema(schema, defaultArray)) {
    const sanitizedArray = []

    // 固定长度数组严格按默认长度修复，缺项和脏项都回同下标默认值。
    for (let i = 0; i < defaultArray.length; i++) {
      sanitizedArray.push(sanitizeBySchema(value[i], defaultArray[i], schema.items))
    }

    return sanitizedArray
  }

  const sanitizedArray = []

  // 可变数组逐项修复；无默认槽位时，非法项会退化成 undefined，随后被过滤掉。
  for (let i = 0; i < value.length; i++) {
    const defaultItem = getDefaultArrayItem(value[i], defaultArray, i)
    const sanitizedItem = sanitizeBySchema(value[i], defaultItem, schema.items)

    if (isSanitizedArrayItemComplete(sanitizedItem, schema.items)) {
      sanitizedArray.push(sanitizedItem)
    }
  }

  return sanitizedArray
}

function sanitizeObject(value, defaultValue, schema) {
  if (isPlainObject(value) === false) {
    return cloneValue(defaultValue)
  }

  const result = {}
  const properties = schema.properties || {}

  // 仅修复 schema 中声明的字段，额外脏字段在加载期直接裁掉。
  for (const key of Object.keys(properties)) {
    const hasValue = Object.prototype.hasOwnProperty.call(value, key)
    const nextValue = hasValue ? value[key] : undefined
    const nextDefaultValue = defaultValue?.[key]

    result[key] = sanitizeBySchema(nextValue, nextDefaultValue, properties[key])
  }

  return result
}

function sanitizeBySchema(value, defaultValue, schema) {
  if (!schema || typeof schema !== 'object') {
    return cloneValue(defaultValue)
  }

  if (schema.type === 'object') {
    return sanitizeObject(value, defaultValue, schema)
  }

  if (schema.type === 'array') {
    return sanitizeArray(value, defaultValue, schema)
  }

  return sanitizeScalar(value, defaultValue, schema)
}

export function sanitizeLoadedConfig(config, defaultConfig, schema) {
  if (isPlainObject(config) === false) {
    return cloneValue(defaultConfig)
  }

  return sanitizeBySchema(config, defaultConfig, schema)
}
