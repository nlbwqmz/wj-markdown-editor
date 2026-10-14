import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import postCssPxToRem from 'postcss-pxtorem'
import UnoCSS from 'unocss/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'

import { defineConfig } from 'vite'

// 剥离 KaTeX 字体声明中的 woff/ttf 候选源：
// Electron 内置 Chromium 只使用 woff2，保留其他格式会让构建产物多拷贝约 817KB 永不加载的字体。
// 必须在 Vite 的 CSS 插件之前（enforce: 'pre'）改写源码，否则 url 已被登记为构建资产。
function stripKatexLegacyFonts() {
  return {
    name: 'strip-katex-legacy-fonts',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]node_modules[\\/]katex[\\/]/.test(id) || !id.includes('.css')) {
        return
      }
      // 仅当该字体声明提供了 woff2 候选源时才剥离 woff/ttf，避免误删唯一可用格式
      return code.replace(/src:([^;}]+)/g, (full, value) => {
        if (!value.includes('woff2')) {
          return full
        }
        return `src:${value.replace(/,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\(["'](?:woff|truetype)["']\)/g, '')}`
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    stripKatexLegacyFonts(),
    vue(),
    UnoCSS(),
    // 模板中的 <a-*> 组件按需自动导入；显式置空 dirs，避免自动导入项目内组件
    Components({
      dirs: [],
      resolvers: [AntDesignVueResolver({ importStyle: false })],
      dts: false,
    }),
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
  test: {
    environment: 'jsdom',
    include: ['src/**/*.vitest.test.js'],
  },
})
