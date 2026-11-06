// 业务数据的目录约定，单独成文件是为了让不依赖 electron 的模块也能复用（例如迁移工具与其单测）。
export const USER_DATA_DIR_ENV = 'WJ_USER_DATA_DIR'

// 单独声明“数据目录写在应用目录下”：
// 前端来源由 WJ_WEB_SOURCE 决定（dev server / web-dist），数据目录与它互不影响。
export const USER_DATA_IN_APP_DIR_ENV = 'WJ_USER_DATA_IN_APP_DIR'

// userData / 应用目录 / WJ_USER_DATA_DIR 之下统一再套一层，业务文件不与 Chromium 缓存混在同一层。
export const USER_DATA_SUBDIR = 'data'
