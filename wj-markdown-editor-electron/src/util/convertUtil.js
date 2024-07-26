import win from "../win/win.js";
import config from "../local/config.js";
import path from "path";
import fsUtil from "./fsUtil.js";
import {exec} from "child_process";
import fs from "fs";
import {dialog} from "electron";
import pathUtil from "./pathUtil.js";
import util from "./util.js";
import globalData from "./globalData.js";
import fileState from "../runtime/fileState.js";

export default {
  convertWord: () => {
    const fileStateItem = fileState.getById(globalData.activeFileId)
    if(!fileStateItem || fileStateItem.exists === false){
      win.showMessage('未找到当前文件', 'warning')
      return;
    }
    if(!fileStateItem.tempContent){
      win.showMessage('当前文档内容为空', 'warning')
      return;
    }
    if(!config.data.pandoc_path){
      win.showMessage('请先配置pandoc地址', 'warning')
      return;
    }
    if(!fileStateItem.saved || !fileStateItem.type){
      win.showMessage('请先保存文件', 'warning')
      return;
    }
    const execute = (docxPath, p, shouldDelete) => {
      let success = true
      let cmd = `pandoc ${p} -o ${docxPath} --from markdown --to docx --resource-path="${path.dirname(p)}"`
      if(fsUtil.exists(path.resolve(config.data.pandoc_path, 'wj-markdown-editor-reference.docx'))){
        cmd += ' --reference-doc=wj-markdown-editor-reference.docx'
      }
      const childProcess = exec(cmd, { cwd: config.data.pandoc_path });
      childProcess.stderr.on('data', function (data) {
        success = false
      })
      // 退出之后的输出
      childProcess.on('close', function (code) {
        if(code === 0 && success === true) {
          win.showMessage('导出成功', 'success', 2, true)
        } else {
          win.showMessage('导出完成，但遇到一些未知问题。', 'warning', 10, true)
        }
        if(shouldDelete){
          fs.unlink(p, () => {})
        }
      })
    }
    const docxPath = dialog.showSaveDialogSync({
      title: "导出word",
      buttonLabel: "导出",
      defaultPath: path.parse(fileStateItem.fileName).name,
      filters: [
        {name: 'docx文件', extensions: ['docx']}
      ]
    })
    if(docxPath){
      win.showMessage('导出中...', 'loading', 0)
      if(fileStateItem.type === 'webdav'){
        const currentPath = path.resolve(pathUtil.getTempPath(), util.createId() + '.md')
        fs.writeFile(currentPath, fileStateItem.tempContent, () => {
          execute(docxPath, currentPath, true)
        })
      } else {
        execute(docxPath, fileStateItem.originFilePath, false)
      }
    }
  }
}
