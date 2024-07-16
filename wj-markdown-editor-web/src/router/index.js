import { createRouter, createWebHashHistory } from 'vue-router'
import store from '@/store'
import commonUtil from '@/util/commonUtil'

const routes = [
  {
    path: '/edit',
    name: 'edit',
    component: () => import('../views/EditView.vue'),
    meta: {
      showTop: true,
      title: 'wj-markdown-editor'
    }
  },
  {
    path: '/preview',
    name: 'preview',
    component: () => import('../views/PreviewView.vue'),
    meta: {
      showTop: true,
      title: 'wj-markdown-editor'
    }
  },
  {
    path: '/setting',
    name: 'setting',
    component: () => import('../views/SettingWin.vue'),
    meta: {
      showTop: false,
      title: '设置'
    }
  },
  {
    path: '/export',
    name: 'export',
    component: () => import('../views/ExportView.vue'),
    meta: {
      showTop: false,
      title: '导出'
    }
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('../views/AboutView.vue'),
    meta: {
      showTop: false,
      title: '关于'
    }
  },
  {
    path: '/notFound',
    name: 'notFound',
    component: () => import('../views/NotFound.vue'),
    meta: {
      showTop: true,
      title: 'wj-markdown-editor'
    }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to, from) => {
  if (to && to.meta && to.meta.title) {
    document.title = to.meta.title
  }
})

router.afterEach((to) => {
  const id = commonUtil.getUrlParam('id')
  if (id) {
    store.commit('updateId', id)
    store.commit('updateRouteState', { id, path: to.path })
  }
})

export default router
