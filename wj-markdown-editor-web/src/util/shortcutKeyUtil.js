import router from '@/router/index.js'
import channelUtil from '@/util/channel/channelUtil.js'

/**
 * 按键映射 与codemirror的快捷键映射规则保持一致
 */
const keyMappings = {
  // 字母键直接返回大写字母
  ...Object.fromEntries(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => [`Key${c}`, c.toLowerCase()]),
  ),
  // 数字键
  ...Object.fromEntries(
    '0123456789'.split('').map(d => [`Digit${d}`, d]),
  ),

  // 小键盘数字
  ...Object.fromEntries(
    '0123456789'.split('').map(d => [`Numpad${d}`, d]),
  ),
  // 功能键
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
  F4: 'F4',
  F5: 'F5',
  F6: 'F6',
  F7: 'F7',
  F8: 'F8',
  F9: 'F9',
  F10: 'F10',
  F11: 'F11',
  F12: 'F12',

  // 符号键
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Comma: ',',
  Period: '.',
  Slash: '/',

  // 控制键
  Escape: 'Esc',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Enter: 'Enter',
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  MetaLeft: 'Meta',
  MetaRight: 'Meta',
  ContextMenu: 'Menu',

  // 导航键
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',

  // 小键盘功能键
  NumLock: 'NumLock',
  NumpadDivide: 'Num/',
  NumpadMultiply: 'Num*',
  NumpadSubtract: 'Num-',
  NumpadAdd: 'Num+',
  NumpadEnter: 'NumEnter',
  NumpadDecimal: 'Num.',

  // 其他
  CapsLock: 'CapsLock',
  PrintScreen: 'PrintScreen',
  ScrollLock: 'ScrollLock',
  Pause: 'Pause',
}

const webShortcutKeyHandler = {
  createNew: () => {
    channelUtil.send({ event: 'create-new' }).then(() => {})
  },
  openFile: () => {
    channelUtil.send({ event: 'open-file' }).then(() => {})
  },
  switchView: () => {
    if (router.currentRoute.value.name === 'editor') {
      router.push({ name: 'preview' }).then(() => {})
    } else {
      router.push({ name: 'editor' }).then(() => {})
    }
  },
  save: () => {
    channelUtil.send({ event: 'save' }).then(() => {})
  },
  saveOther: () => {
    channelUtil.send({ event: 'save-other' }).then(() => {})
  },
  setting: () => {
    channelUtil.send({ event: 'open-setting' }).then(() => {})
  },
}

/**
 * 将按键代码转换为按键名称
 */
function codeToKeyName(code) {
  // 移除前缀并处理特殊按键
  const key = code.replace(/^(Key|Digit|Numpad)/, '')
  return keyMappings[code] || key
}

/**
 * 处理包含Shift键时的字符映射
 */
function getShiftedCharacter(keyValue) {
  // 定义 Shift 键按下时的字符映射
  const shiftMap = {
    '1': '!',
    '2': '@',
    '3': '#',
    '4': '$',
    '5': '%',
    '6': '^',
    '7': '&',
    '8': '*',
    '9': '(',
    '0': ')',
    '-': '_',
    '=': '+',
    '[': '{',
    ']': '}',
    '\\': '|',
    ';': ':',
    '\'': '"',
    ',': '<',
    '.': '>',
    '/': '?',
    '`': '~',
  }

  // 处理字母键：Shift 按下时转为大写
  if (/^[a-z]$/.test(keyValue)) {
    return keyValue.toUpperCase()
  }

  // 处理符号键：通过映射表转换
  if (shiftMap[keyValue]) {
    return shiftMap[keyValue]
  }

  // 其他情况直接返回原值
  return keyValue
}

/**
 * 获取快捷键
 */
function getShortcutKey(e) {
  const list = []
  if (e.ctrlKey) {
    list.push('Ctrl')
  }
  if (e.shiftKey) {
    list.push('Shift')
  }
  if (e.altKey) {
    list.push('Alt')
  }
  // 同时使用shift和alt需要转换字符
  list.push(e.shiftKey && e.altKey ? getShiftedCharacter(codeToKeyName(e.code)) : codeToKeyName(e.code))
  return list.join('+')
}

/**
 * 是否为快捷键
 */
function isShortcutKey(e) {
  // 排除只按下修饰键的情况 排除非组合键的情况（shift不能单独使用）
  return !(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code) || (!e.ctrlKey
    && !e.altKey && !e.metaKey))
}

/**
 * 获取快捷键处理器
 */
function getWebShortcutKeyHandler(id, execute) {
  if (execute === true) {
    webShortcutKeyHandler[id] && webShortcutKeyHandler[id]()
  } else {
    return webShortcutKeyHandler[id]
  }
}

export default {
  getShortcutKey,
  isShortcutKey,
  getWebShortcutKeyHandler,
}
