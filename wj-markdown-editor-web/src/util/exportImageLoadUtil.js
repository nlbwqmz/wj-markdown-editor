/**
 * 等待单张图片进入结束态。
 *
 * 这里只要求资源“完成加载或失败”，
 * 不要求图片一定可显示，
 * 这样坏图也不会阻塞导出。
 *
 * @param {EventTarget & { complete?: boolean } | null | undefined} image
 * @returns {Promise<void>}
 */
function waitForSingleImageSettled(image) {
  if (!image || image.complete === true) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const settle = () => {
      image.removeEventListener?.('load', settle)
      image.removeEventListener?.('error', settle)
      resolve()
    }

    image.addEventListener?.('load', settle)
    image.addEventListener?.('error', settle)

    // 监听挂上后再次检查，避免在两次操作之间恰好完成导致悬挂。
    if (image.complete === true) {
      settle()
    }
  })
}

/**
 * 等待一组图片全部进入结束态。
 *
 * @param {ArrayLike<EventTarget & { complete?: boolean }> | null | undefined} images
 * @returns {Promise<void>}
 */
export async function waitForImagesSettled(images) {
  const imageList = Array.from(images || [])
  await Promise.all(imageList.map(image => waitForSingleImageSettled(image)))
}

export default {
  waitForImagesSettled,
}
