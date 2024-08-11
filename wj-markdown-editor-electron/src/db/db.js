import Sqlite3 from 'sqlite3'
import pathUtil from '../util/pathUtil.js'

const createConnection = () => {
  return new Sqlite3.Database(pathUtil.getDbPath())
}

const db = createConnection()

export default {
  close: () => {
    db.close()
  },
  run: (sql, params) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  },
  get: (sql, params) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err)
        } else {
          resolve(row)
        }
      })
    })
  },
  all: (sql, params) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err)
        } else if (rows) {
          resolve(rows)
        } else {
          resolve([])
        }
      })
    })
  }
}
