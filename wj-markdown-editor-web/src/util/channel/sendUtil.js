export default {
  send: async (data) => {
    return await window.node.sendToMain(data)
  },
}
