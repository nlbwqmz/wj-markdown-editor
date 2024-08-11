import defaultConfig from '../constant/defaultConfig.js'
import util from '../util/util.js'
import db from './db.js'

const createTable = async () => {
  await db.run('create table if not exists wj_markdown_editor_config (id varchar(512) PRIMARY KEY, key text, value text)')
}

const initData = async () => {
  for (const key in defaultConfig) {
    const origin = await db.get('select * from wj_markdown_editor_config where key = ?', [key])
    if (origin === undefined) {
      await db.run('insert into wj_markdown_editor_config (id, key, value) values (?,?,?)', [util.createId(), key, defaultConfig[key].set(defaultConfig[key].value)])
    }
  }
}

await createTable()
await initData()

export default {
  selectConfig: async () => {
    const rows = await db.all('select * from wj_markdown_editor_config')
    const target = {}
    rows.forEach(item => {
      target[item.key] = defaultConfig[item.key].get(item.value)
    })
    return target
  },
  updateAllConfig: async data => {
    for (const key in data) {
      await db.run('update wj_markdown_editor_config set value = ? where key = ?', [defaultConfig[key].set(data[key]), key])
    }
  }
}
