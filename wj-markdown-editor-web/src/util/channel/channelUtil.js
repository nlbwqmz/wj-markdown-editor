export default {
  send: async (data) => {
    return await window.node.sendToMain(data)
  },
  sendSync: (data) => {
    return window.node.sendToMainSync(data)
  },
  getWebFilePath: file => window.node.getWebFilePath(file),
}
