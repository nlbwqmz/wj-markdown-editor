import { createRouter, createWebHashHistory } from 'vue-router'

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
    path: '/exitModal',
    name: 'exitModal',
    component: () => import('../views/ExitModal.vue'),
    meta: {
      showTop: false
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
    path: '/searchBar',
    name: 'searchBar',
    component: () => import('../views/SearchBar.vue'),
    meta: {
      showTop: false
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

export default router
