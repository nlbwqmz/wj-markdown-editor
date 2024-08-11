import pathUtil from '../util/pathUtil.js'

const stringValue = value => {
  return {
    value,
    get: value => value,
    set: value => String(value)
  }
}

const numberValue = value => {
  return {
    value,
    get: value => Number(value),
    set: value => String(value)
  }
}

const booleanValue = value => {
  return {
    value,
    get: value => value && value.toLowerCase() === 'true',
    set: value => String(value)
  }
}

const defaultConfig = {
  // 初次进入的路由
  init_route: stringValue('edit'),
  minimize_to_tray: booleanValue(false),
  // 预览页面内容宽度
  preview_width: numberValue(80),
  // 窗口宽度
  win_width: numberValue(-1),
  // 窗口高度
  win_height: numberValue(-1),
  // 显示路由跳转按钮
  jump_router_btn: booleanValue(true),
  // 预览界面是否默认显示目录
  catalog_show: booleanValue(true),
  // 图片插入模式 1: 无操作 2: 复制到 ./%{filename} 文件夹 3: 复制到 ./assets 文件夹 4: 复制到指定文件夹 5: 上传
  insert_local_img_type: stringValue('3'),
  insert_network_img_type: stringValue('3'),
  insert_pasteboard_local_img_type: stringValue('3'),
  insert_pasteboard_network_img_type: stringValue('3'),
  insert_screenshot_img_type: stringValue('3'),
  // 图片复制到指定路径
  img_save_path: stringValue(pathUtil.getDefaultImgSavePath()),
  theme: stringValue('default'),
  preview_theme: stringValue('default'),
  code_theme: stringValue('atom'),
  pic_go_host: stringValue('127.0.0.1'),
  pic_go_port: numberValue(36677),
  auto_save_minute: numberValue(0),
  // 默认显示webdav
  show_web_dav: booleanValue(true),
  watermark_enabled: booleanValue(true),
  watermark_export_date: booleanValue(true),
  watermark_export_date_format: stringValue('YYYY-MM-DD'),
  watermark_content: stringValue('wj-markdown-editor'),
  watermark_rotate: numberValue(-22),
  watermark_gap: {
    value: [100, 100],
    get: value => JSON.parse(value),
    set: value => JSON.stringify(value)
  },
  watermark_font_color: stringValue('#5433334F'),
  watermark_font_size: numberValue(20),
  watermark_font_weight: numberValue(800),
  pandoc_path: stringValue(''),
  show_code_row_number: booleanValue(false)
}
export default defaultConfig
