class EventEmit {
  #list = []

  on(event, callback) {
    if (!event) {
      throw new Error('event is required')
    }
    if (!callback) {
      throw new Error('callback is required')
    }
    this.#list.push({
      event,
      callback,
    })
  }

  remove(event, callback) {
    this.#list = this.#list.filter(item => !(item.event === event && item.callback === callback))
  }

  publish(event, obj) {
    this.#list.forEach((item) => {
      if (item.event === event) {
        try {
          item.callback(obj)
        }
        catch (e) {
          console.error(e)
        }
      }
    })
  }
}

const eventEmit = new EventEmit()

export default eventEmit
