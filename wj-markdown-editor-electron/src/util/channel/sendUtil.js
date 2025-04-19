export default {
  send: (win, data) => {
    win.webContents.send('sendToShow', data)
  },
}
