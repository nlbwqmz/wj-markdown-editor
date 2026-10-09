// 将语言偏好解析为实际使用的语言。
// 明确的语言偏好（zh-CN / en-US）原样返回，不读取系统 locale；
// 'auto' 及未知值：系统为中文系语言时使用中文，其余（含 C locale、未设置、无法识别）一律回退英文，
// 以满足 AppImage 目录“非中文系统必须显示英文”的收录要求。
export function resolveLanguagePreference(preference, systemLocale) {
  if (preference === 'zh-CN' || preference === 'en-US') {
    return preference
  }

  const normalized = String(systemLocale || '').toLowerCase()
  return normalized.startsWith('zh') ? 'zh-CN' : 'en-US'
}
