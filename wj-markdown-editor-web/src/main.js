import eventUtil from '@/util/channel/eventUtil.js'
import commonUtil from '@/util/commonUtil.js'
import Antd from 'ant-design-vue'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import '@/assets/style/reset.css'
import '@/assets/style/common.scss'
import 'virtual:uno.css'
import 'ant-design-vue/dist/reset.css'
import 'katex/dist/katex.min.css'
import '@/assets/style/scroll.scss'
import '@/assets/style/wj-markdown-it-container.scss'
// 代码主题
import '@/assets/style/code-theme/code-theme.scss'
// 预览主题
import '@/assets/style/preview-theme/preview-theme.scss'
import '@/assets/style/antd.scss'
import '@/assets/style/search.scss'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Antd)
app.mount('#app')

commonUtil.initMessageConfig()
eventUtil.link()
eventUtil.on()
