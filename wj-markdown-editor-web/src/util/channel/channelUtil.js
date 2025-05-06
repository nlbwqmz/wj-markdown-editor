export default {
  send: async (data) => {
    return await window.node.sendToMain(data)
  },
  getWebFilePath: file => window.node.getWebFilePath(file),
}
