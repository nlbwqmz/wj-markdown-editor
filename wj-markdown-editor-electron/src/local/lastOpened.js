import fs from "fs";
import pathUtil from "../util/pathUtil.js";

export default {
  read: () => {
    return new Promise((resolve, reject) => {
      fs.access(pathUtil.getLastOpenedFilePath(), fs.constants.F_OK, err => {
        if(err){
          resolve([])
        } else {
          fs.readFile(pathUtil.getLastOpenedFilePath(), (err, data) => {
            resolve(JSON.parse(data.toString()))
          })
        }
      })
    })
  },
  write: data => {
    fs.writeFile(pathUtil.getLastOpenedFilePath(), JSON.stringify(data), () => {})
  }
}
