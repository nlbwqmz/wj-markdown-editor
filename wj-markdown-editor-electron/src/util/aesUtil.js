import crypto from 'crypto'
import machine from 'node-machine-id'

const getZeroStr = length => {
  let str = ''
  for (let i = 0; i < length; i++) {
    str += '0'
  }
  return str
}

let key
const machineId = machine.machineIdSync()
if (!machineId) {
  key = getZeroStr(16)
} else if (machineId.length < 16) {
  key = machineId + getZeroStr(16 - machineId.length)
} else {
  key = machineId.substring(0, 16)
}
export default {
  encrypt: content => {
    const cipher = crypto.createCipheriv('aes-128-cbc', key, key)
    return cipher.update(content, 'utf8', 'hex') + cipher.final('hex')
  },
  decrypt: content => {
    const cipher = crypto.createDecipheriv('aes-128-cbc', key, key)
    return cipher.update(content, 'hex', 'utf8') + cipher.final('utf8')
  }
}
