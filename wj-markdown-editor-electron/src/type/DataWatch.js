export default class {
    #handleList = []
    constructor(data) {
        this.data = new Proxy(data, {
            set: (target, name, value, receiver) => {
                target[name] = value
                this.#handleList.forEach(item => {
                    if(!item.nameList || item.nameList.length === 0 || item.nameList.indexOf(name) > -1) {
                        item.handle && item.handle(JSON.parse(JSON.stringify(target)))
                    }
                })
                return true
            }
        })
    }
    watch(nameList, handle) {
        this.#handleList.push({ nameList, handle })
    }
}
