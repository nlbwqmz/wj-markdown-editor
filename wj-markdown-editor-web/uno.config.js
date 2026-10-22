import { defineConfig, presetIcons, presetUno } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
      collections: {
        tabler: () => import('@iconify-json/tabler/icons.json').then(i => i.default),
      },
    }),
  ],
  theme: {
    // ...
    // 这里只负责把 global-theme 里定义的 CSS 变量注册成 UnoCSS 工具类
    // （bg-bg-primary / text-text-primary / border-border-primary 等），
    // 颜色值本身只在 assets/style/global-theme/{light,dark}.scss 定义，不要在这里写死色值。
    colors: {
      text: {
        primary: 'var(--wj-markdown-text-primary)',
        secondary: 'var(--wj-markdown-text-secondary)',
      },
      bg: {
        primary: 'var(--wj-markdown-bg-primary)',
        hover: 'var(--wj-markdown-bg-hover)',
      },
      border: {
        primary: 'var(--wj-markdown-border-primary)',
      },
    },
  },
})
