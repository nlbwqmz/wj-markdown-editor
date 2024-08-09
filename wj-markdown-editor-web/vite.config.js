import { fileURLToPath, URL } from 'node:url'
import eslint from 'vite-plugin-eslint'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    eslint({
      lintOnStart: true
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    base: './',
    outDir: '../wj-markdown-editor-electron/web-dist',
    emptyOutDir: true
  },
  server: {
    port: 8080
  }
})
