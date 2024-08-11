import path from 'path'
import util from '../util/util.js'
import win from '../win/win.js'
import openedDb from '../db/openedDb.js'

let autoLogin = false
const createProxy = obj => {
  return new Proxy(obj, {
    set (target, name, newValue, receiver) {
      target[name] = newValue
      flush()
      return true
    }
  })
}

const initFileStateList = async () => {
  const list = (await openedDb.selectOpened()).map(item => {
    return {
      id: item.id,
      originFilePath: item.path,
      fileName: item.name,
      type: item.type
    }
  })
  list.forEach(item => {
    item.saved = true
  })
  if (util.isOpenOnFile()) {
    const originFilePath = util.getOpenOnFilePath()
    const index = list.findIndex(item => item.originFilePath === originFilePath && item.type === 'local')
    if (index > -1) {
      list.splice(index, 1)
    }
    list.push({
      id: util.createId(),
      saved: true,
      content: '',
      tempContent: '',
      originFilePath,
      fileName: path.basename(originFilePath),
      type: 'local',
      loaded: false
    })
  }
  if (list.length === 0) {
    list.push({
      id: util.createId(),
      saved: true,
      content: '',
      tempContent: '',
      originFilePath: undefined,
      fileName: 'untitled',
      type: '',
      loaded: false
    })
  }
  return list.map(item => createProxy(item))
}

const fileStateList = [...await initFileStateList()]

const flush = () => {
  win.updateFileStateList(fileStateList.map(item => {
    return {
      id: item.id,
      saved: item.saved,
      originFilePath: item.originFilePath,
      fileName: item.fileName,
      type: item.type
    }
  }))
  openedDb.writeOpened(fileStateList.filter(item => (autoLogin === true && item.type) || (!autoLogin && item.type === 'local')).map(item => {
    return {
      id: item.id,
      path: item.originFilePath,
      name: item.fileName,
      type: item.type
    }
  }))
}

const creatFileState = () => {
  return createProxy({
    id: util.createId(),
    saved: true,
    content: '',
    tempContent: '',
    originFilePath: '',
    fileName: 'untitled',
    type: ''
  })
}

export default {
  get: filter => {
    if (filter) {
      return fileStateList.filter(filter)
    }
    return fileStateList
  },
  find: filter => {
    return fileStateList.find(filter)
  },
  some: filter => {
    return fileStateList.some(filter)
  },
  getByIndex: index => {
    return fileStateList[index]
  },
  getById: id => {
    return fileStateList.find(item => item.id === id)
  },
  push: item => {
    fileStateList.push(createProxy(item))
    flush()
  },
  set: list => {
    fileStateList.splice(0, fileStateList.length)
    fileStateList.push(...list)
    flush()
  },
  refresh: () => {
    flush()
  },
  clearAndPushNew: () => {
    fileStateList.splice(0, fileStateList.length)
    const item = creatFileState()
    fileStateList.push(item)
    flush()
    return item
  },
  pushNew: () => {
    const item = creatFileState()
    fileStateList.push(item)
    flush()
    return item
  },
  getLength: () => {
    return fileStateList.length
  },
  updateAutoLogin: flag => {
    autoLogin = flag
    flush()
  }
}
