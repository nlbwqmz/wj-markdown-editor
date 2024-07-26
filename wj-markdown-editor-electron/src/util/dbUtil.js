import pathUtil from "./pathUtil.js";

import Sqlite3 from 'sqlite3'
import defaultConfig from "../constant/defaultConfig.js";
import util from "./util.js";

const dbPath = pathUtil.getDbPath()

/**
 * 创建链接
 */
const createConnection = () => {
  return new Sqlite3.Database(dbPath);
}

const db = createConnection()

const createTable = () => {
  return new Promise((resolve, reject) => {
    db.run('create table if not exists wj_markdown_editor_config (id varchar(500) PRIMARY KEY, key text, value text)', (err) => {
      if(err){
        reject(err)
      } else {
        resolve()
      }
    });
  })

}

const initData = () => {
  const list = []
  for (let key in defaultConfig) {
    list.push(new Promise((resolve, reject) => {
      db.get('select * from wj_markdown_editor_config where key = ?', [key], (err, row) => {
        if(row === undefined){
          db.run('insert into wj_markdown_editor_config (id, key, value) values (?,?,?)', [util.createId(), key, defaultConfig[key].set(defaultConfig[key].value)], (e) => {
            resolve()
          })
        } else {
          resolve()
        }
      })
    }))
  }
  return Promise.all(list)
}

const init = async () => {
  await createTable()
  await initData()
}

await init()

export default {
  close: () => {
    db.close()
  },
  selectConfig: () => {
    return new Promise((resolve, reject) => {
      db.all('select * from wj_markdown_editor_config', (err, rows) => {
        if(err){
          reject(err)
        } else {
          if(rows && rows.length > 0) {
            const target = {}
            rows.forEach(item => {
              target[item.key] = defaultConfig[item.key].get(item.value)
            })
            resolve(target)
          } else {
            reject(new Error('查询配置数据出错'))
          }
        }
      })
    })
  },
  updateAllConfig: data => {
    for (let key in data) {
      db.run(`update wj_markdown_editor_config set value = ? where key = ?`, [defaultConfig[key].set(data[key]), key])
    }
  }
}
