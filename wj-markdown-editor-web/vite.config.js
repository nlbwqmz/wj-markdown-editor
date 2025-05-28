import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import postCssPxToRem from 'postcss-pxtorem'
import UnoCSS from 'unocss/vite'

import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    vue(),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../wj-markdown-editor-electron/web-dist',
    emptyOutDir: true,
    target: 'esnext',
  },
  css: {
    postcss: {
      plugins: [
        postCssPxToRem({
          rootValue: 16,
          propList: ['*'],
          selectorBlackList: ['grid-rows-', 'grid-cols', 'wj-scrollbar'],
        }),
      ],
    },
  },
  server: {
    port: 8080,
  },
})
