import fs from "fs"
import path from "path"
const mkdirSyncWithRecursion = dirname => {
    if(fs.existsSync(dirname)) {
        return true;
    }else{
        if (mkdirSyncWithRecursion(path.dirname(dirname))){
            fs.mkdirSync(dirname);
            return true;
        }
    }
}
const deleteFolder = dir => {
    let files = fs.readdirSync(dir)
    for(let i=0;i<files.length;i++){
        let newPath = path.join(dir,files[i]);
        let stat = fs.statSync(newPath)
        if(stat.isDirectory()){
            //如果是文件夹就递归下去
            deleteFolder(newPath);
        }else {
            //删除文件
            fs.unlinkSync(newPath);
        }
    }
    fs.rmdirSync(dir)//如果文件夹是空的，就将自己删除掉
}
export default {
    mkdirSyncWithRecursion,
    deleteFileList: filePathList => {
        filePathList.forEach(filePath => {
            fs.unlinkSync(filePath)
        })
    },
    getJsonFileContent: (filePath, defaultJson) => {
        try {
            return JSON.parse(fs.readFileSync(filePath).toString())
        } catch (e) {
            return defaultJson
        }
    },
    exists: filePath => {
        return fs.existsSync(filePath)
    },
    deleteFolder
}
