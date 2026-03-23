export function cloneConfig(config) {
  // 配置对象当前均为可 JSON 序列化的数据结构，这里使用最直接的深拷贝方案。
  return JSON.parse(JSON.stringify(config))
}
