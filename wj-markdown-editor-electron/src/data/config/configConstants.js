import path from 'node:path'

export const configVersion = 1
export const configFileName = 'config.json'

export function resolveConfigDir(app) {
  return app.isPackaged
    ? path.resolve(app.getPath('documents'), 'wj-markdown-editor')
    : app.getAppPath()
}
