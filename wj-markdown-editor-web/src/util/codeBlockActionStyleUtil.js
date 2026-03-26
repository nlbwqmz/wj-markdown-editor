const ACTION_VARIABLE_DEFAULTS = Object.freeze({
  '--wj-code-block-action-fg': 'rgba(255, 255, 255, 0.92)',
  '--wj-code-block-action-fg-muted': 'rgba(255, 255, 255, 0.72)',
  '--wj-code-block-action-bg': 'rgba(0, 0, 0, 0.16)',
  '--wj-code-block-action-border': 'rgba(255, 255, 255, 0.16)',
  '--wj-code-block-action-shadow': '0 1px 2px rgba(0, 0, 0, 0.18)',
})

const LIGHT_COLOR = { r: 255, g: 255, b: 255, a: 1 }
const DARK_COLOR = { r: 17, g: 24, b: 39, a: 1 }

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function clampAlpha(value) {
  return Math.max(0, Math.min(1, value))
}

function parseAlpha(alphaText) {
  if (!alphaText) {
    return 1
  }
  if (alphaText.endsWith('%')) {
    return clampAlpha(Number.parseFloat(alphaText) / 100)
  }
  return clampAlpha(Number.parseFloat(alphaText))
}

function parseHexColor(value) {
  const normalizedValue = value.trim().toLowerCase()
  const matched = normalizedValue.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/u)
  if (!matched) {
    return null
  }

  const hexText = matched[1]
  if (hexText.length === 3) {
    return {
      r: Number.parseInt(`${hexText[0]}${hexText[0]}`, 16),
      g: Number.parseInt(`${hexText[1]}${hexText[1]}`, 16),
      b: Number.parseInt(`${hexText[2]}${hexText[2]}`, 16),
      a: 1,
    }
  }

  if (hexText.length === 6) {
    return {
      r: Number.parseInt(hexText.slice(0, 2), 16),
      g: Number.parseInt(hexText.slice(2, 4), 16),
      b: Number.parseInt(hexText.slice(4, 6), 16),
      a: 1,
    }
  }

  return {
    r: Number.parseInt(hexText.slice(0, 2), 16),
    g: Number.parseInt(hexText.slice(2, 4), 16),
    b: Number.parseInt(hexText.slice(4, 6), 16),
    a: clampAlpha(Number.parseInt(hexText.slice(6, 8), 16) / 255),
  }
}

function parseRgbColor(value) {
  const normalizedValue = value.trim().toLowerCase()
  const matched = normalizedValue.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/u)
  if (!matched) {
    return null
  }

  return {
    r: clampChannel(Number.parseFloat(matched[1])),
    g: clampChannel(Number.parseFloat(matched[2])),
    b: clampChannel(Number.parseFloat(matched[3])),
    a: parseAlpha(matched[4]),
  }
}

function parseCssColor(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toLowerCase()
  if (!normalizedValue) {
    return null
  }
  if (normalizedValue === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 }
  }

  return parseRgbColor(normalizedValue) || parseHexColor(normalizedValue)
}

function getRelativeLuminance(color) {
  const channels = [color.r, color.g, color.b].map((channelValue) => {
    const sRgb = channelValue / 255
    return sRgb <= 0.03928 ? sRgb / 12.92 : ((sRgb + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function mixColor(baseColor, overlayColor, weight, alpha) {
  return {
    r: clampChannel(baseColor.r + (overlayColor.r - baseColor.r) * weight),
    g: clampChannel(baseColor.g + (overlayColor.g - baseColor.g) * weight),
    b: clampChannel(baseColor.b + (overlayColor.b - baseColor.b) * weight),
    a: clampAlpha(alpha),
  }
}

function toRgbaText(color, alphaOverride = color.a) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clampAlpha(alphaOverride)})`
}

function createFallbackVariables() {
  return { ...ACTION_VARIABLE_DEFAULTS }
}

export function deriveCodeBlockActionVariables(snapshot = {}) {
  const backgroundColor = parseCssColor(snapshot.backgroundColor)
  if (!backgroundColor || backgroundColor.a <= 0.01) {
    return createFallbackVariables()
  }

  const isDarkBackground = getRelativeLuminance(backgroundColor) < 0.42
  const parsedTextColor = parseCssColor(snapshot.color)
  const textColor = parsedTextColor && parsedTextColor.a > 0.01
    ? parsedTextColor
    : (isDarkBackground ? LIGHT_COLOR : DARK_COLOR)
  const overlayBaseColor = isDarkBackground ? LIGHT_COLOR : DARK_COLOR
  const backgroundWeight = isDarkBackground ? 0.16 : 0.08
  const borderWeight = isDarkBackground ? 0.24 : 0.14
  const shadow = isDarkBackground
    ? '0 1px 2px rgba(0, 0, 0, 0.28)'
    : ACTION_VARIABLE_DEFAULTS['--wj-code-block-action-shadow']

  return {
    '--wj-code-block-action-fg': toRgbaText(textColor, 0.92),
    '--wj-code-block-action-fg-muted': toRgbaText(textColor, 0.72),
    '--wj-code-block-action-bg': toRgbaText(mixColor(backgroundColor, overlayBaseColor, backgroundWeight, 0.94)),
    '--wj-code-block-action-border': toRgbaText(mixColor(backgroundColor, overlayBaseColor, borderWeight, 0.92)),
    '--wj-code-block-action-shadow': shadow,
  }
}

export function syncCodeBlockActionVariables(previewRoot, options = {}) {
  const getComputedStyleImpl = options.getComputedStyle || globalThis.getComputedStyle
  const hljsElement = previewRoot?.querySelector?.('.hljs') || null

  let variables = createFallbackVariables()

  if (hljsElement && typeof getComputedStyleImpl === 'function') {
    try {
      variables = deriveCodeBlockActionVariables(getComputedStyleImpl(hljsElement))
    } catch {
      variables = createFallbackVariables()
    }
  }

  if (previewRoot?.style?.setProperty) {
    Object.entries(variables).forEach(([key, value]) => {
      previewRoot.style.setProperty(key, value)
    })
  }

  return variables
}
