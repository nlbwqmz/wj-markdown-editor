import db from "./db.js";
import util from "../util/util.js";

const createTable = async () => {
  await db.run('create table if not exists wj_markdown_editor_opened (id varchar(512) PRIMARY KEY, path varchar(1024), name varchar(512), type varchar(512))')
}

await createTable()

export default {
  selectOpened: async () => {
    const rows = await db.all('select * from wj_markdown_editor_opened')
    if(rows && rows.length > 0){
      return rows
    }
    return []
  },
  writeOpened: util.debounce(list => {
    db.run('delete from wj_markdown_editor_opened').then(() => {
      list.forEach(item => {
        db.run('insert into wj_markdown_editor_opened (id, path, name, type) values (?,?,?,?)', [item.id, item.path, item.name, item.type]).then()
      })
    })
  })
}
