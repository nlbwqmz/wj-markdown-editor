import { defineAsyncComponent } from 'vue'

// vue3-colorpicker 体积较大且仅在用户操作时使用，改为动态加载（含样式），移出首屏同步解析路径。
function loadColorPicker() {
  return Promise.all([
    import('vue3-colorpicker'),
    import('vue3-colorpicker/style.css'),
  ])
}

// 空闲时预取资源，让加载与首屏渲染并行完成：
// 否则首次打开颜色面板时组件尚未就绪，popover 会先按空内容定位、随后跳到正确位置。
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(() => {
    loadColorPicker()
  })
}

export default defineAsyncComponent(() => loadColorPicker().then(([module]) => module.ColorPicker))
