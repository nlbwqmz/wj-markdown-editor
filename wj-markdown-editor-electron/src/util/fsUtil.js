const fs = require("fs");
const path = require("path");
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
module.exports = {
    mkdirSyncWithRecursion,
    deleteFileList: filePathList => {
        filePathList.forEach(filePath => {
            fs.unlinkSync(filePath)
        })
    }
}
