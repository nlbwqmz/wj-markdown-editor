import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      children: [
        {
          path: '/editor',
          name: 'editor',
          component: () => import('../views/EditorView.vue'),
        },
        {
          path: '/preview',
          name: 'preview',
          component: () => import('../views/PreviewView.vue'),
        },
      ],
    },
    {
      path: '/setting',
      name: 'setting',
      component: () => import('../views/SettingView.vue'),
    },
    {
      path: '/export',
      name: 'export',
      component: () => import('../views/ExportView.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
    },
    {
      path: '/guide',
      name: 'guide',
      component: () => import('../views/GuideView.vue'),
    },
  ],
})

export default router
