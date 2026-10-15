import { defineAsyncComponent } from 'vue'

// vue3-colorpicker 体积较大（约 137KB JS + 36KB CSS）且仅在用户操作时使用，
// 改为首次渲染时动态加载（含样式），避免进入首屏加载路径。
export default defineAsyncComponent(() =>
  Promise.all([
    import('vue3-colorpicker'),
    import('vue3-colorpicker/style.css'),
  ]).then(([module]) => module.ColorPicker),
)
