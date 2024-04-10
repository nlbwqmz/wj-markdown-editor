import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import { config } from 'md-editor-v3'
// 行号
// import { lineNumbers } from '@codemirror/view'
import nodeRegisterUtil from '@/util/nodeRegisterUtil'

import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import './assets/css/common.less'
import './assets/css/variable.css'
import './assets/css/loading.less'
import commonUtil from '@/util/commonUtil'

nodeRegisterUtil.init()
commonUtil.initMessageConfig()
config({
  markdownItPlugins (plugins) {
    return plugins.filter((p) => p.type !== 'xss')
  },
  // 删除编辑器保存快捷键
  codeMirrorExtensions (theme, extensions) {
    const newExtensions = [...extensions]
    const index = newExtensions[0].value.findIndex(item => item.key === 'Ctrl-s')
    newExtensions[0].value.splice(index, 1)
    return newExtensions
  },
  markdownItConfig (md) {
    // ------------ 给本地图片加上自定义协议 ------------
    md.renderer.rules.image = (tokens, idx, options, env, slf) => {
      const token = tokens[idx]
      // "alt" attr MUST be set, even if empty. Because it's mandatory and
      // should be placed on proper position for tests.
      //
      // Replace content with actual value
      token.attrs[token.attrIndex('alt')][1] = slf.renderInlineAsText(token.children, options, env)
      if (token.attrs) {
        const srcIndex = token.attrs.findIndex(item => item && item[0] === 'src')
        if (srcIndex > -1) {
          const src = token.attrs[srcIndex][1]
          if (src) {
            if (!src.match('^http')) {
              token.attrs[srcIndex][1] = decodeURIComponent('wj:///' + src)
            }
          }
        }
      }
      return slf.renderToken(tokens, idx, options)
    }
    // ------------ 给链接加上_blank ------------
    const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options)
    }
    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
      // If you are sure other plugins can't add `target` - drop check below
      const aIndex = tokens[idx].attrIndex('target')
      if (aIndex < 0) {
        // add new attribute
        tokens[idx].attrPush(['target', '_blank'])
      } else {
        // replace value of existing attr
        tokens[idx].attrs[aIndex][1] = '_blank'
      }
      // pass token to default renderer.
      return defaultRender(tokens, idx, options, env, self)
    }
  },
  editorExtensions: {
    iconfont: './lib/font_2605852_prouiefeic.js',
    screenfull: { js: './lib/screenfull.min.js' },
    highlight: {
      js: './lib/highlight.min.js',
      css: {
        atom: { light: './lib/atom-one-light.min.css', dark: './lib/atom-one-dark.min.css' },
        a11y: { light: './lib/a11y-light.min.css', dark: './lib/a11y-dark.min.css' },
        github: { light: './lib/github.min.css', dark: './lib/github-dark.min.css' },
        paraiso: { light: './lib/paraiso-light.min.css', dark: './lib/paraiso-dark.min.css' },
        qtcreator: { light: './lib/qtcreator-light.min.css', dark: './lib/qtcreator-dark.min.css' },
        gradient: { light: './lib/gradient-light.min.css', dark: './lib/gradient-dark.min.css' },
        kimbie: { light: './lib/kimbie-light.min.css', dark: './lib/kimbie-dark.min.css' },
        stackoverflow: { light: './lib/stackoverflow-light.min.css', dark: './lib/stackoverflow-dark.min.css' }
      }
    },
    prettier: { standaloneJs: './lib/standalone.2.8.0.js', parserMarkdownJs: './lib/parser-markdown.2.8.0.js' },
    katex: { js: './lib/katex.0.16.9.min.js', css: './lib/katex.0.16.9.min.css' },
    mermaid: { js: './lib/mermaid.10.6.1.min.js' },
    cropper: { js: './lib/cropper.1.5.13.min.js', css: './lib/cropper.1.5.13.min.css' }
  }
})
const app = createApp(App).use(store).use(router).use(Antd)

app.directive('loading', (el, binding) => {
  if (binding.value) {
    if (!binding.oldValue) {
      el.classList.add('wj-loading-container-origin')
      if (!['relative', 'fixed', 'absolute'].includes(el.style.position)) {
        el.classList.add('wj-loading-container-origin-relative')
      }
      const div = document.createElement('div')
      div.classList.add('wj-loading')
      div.innerHTML = '<div class="wj-loading-container"><div class="wj-loader-bounce"></div></div>'
      el.appendChild(div)
    }
  } else {
    el.classList.remove('wj-loading-container-origin', 'wj-loading-container-origin-relative')
    const dom = el.querySelector('.wj-loading')
    if (dom) {
      dom.remove()
    }
  }
})
app.mount('#app')
