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
