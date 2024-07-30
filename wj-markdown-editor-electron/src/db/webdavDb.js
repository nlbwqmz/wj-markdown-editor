import db from "./db.js";

const createTable = async () => {
  await db.run('create table if not exists wj_markdown_editor_webdav (url varchar(512), username varchar(512), password varchar(512))')
}

await createTable()

export default {
  removeWebdav: async () => {
    await db.run('delete from wj_markdown_editor_webdav')
  },
  insertWebdav: async data => {
    await db.run('delete from wj_markdown_editor_webdav')
    await db.run('insert into wj_markdown_editor_webdav (url, username, password) values (?,?,?)', [data.url, data.username, data.password])
  },
  selectWebdav: async () => {
    const rows = await db.all('select * from wj_markdown_editor_webdav')
    if(rows && Array.isArray(rows) &&rows.length > 0) {
      return rows[0]
    }
    return undefined
  },
}
