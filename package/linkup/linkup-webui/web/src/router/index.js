import { createRouter, createWebHashHistory } from 'vue-router'
import { useSessionStore } from '../stores/session'

const routes = [
  { path: '/login', name: 'login', component: () => import('../pages/LoginView.vue'), meta: { public: true } },
  { path: '/first-run', name: 'first-run', component: () => import('../pages/FirstRunView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../layouts/AppShell.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('../pages/DashboardView.vue') },
      { path: 'cellular', name: 'cellular', component: () => import('../pages/ModemView.vue') },
      { path: 'cellular/bands', name: 'bands', component: () => import('../pages/BandsView.vue') },
      { path: 'cellular/sms', name: 'sms', component: () => import('../pages/SmsView.vue') },
      { path: 'cellular/ussd', name: 'ussd', component: () => import('../pages/UssdView.vue') },
      { path: 'cellular/at', name: 'at', component: () => import('../pages/AtConsoleView.vue') },
      { path: 'cellular/esim', name: 'esim', component: () => import('../pages/EsimView.vue') },
      { path: 'internet', name: 'internet', component: () => import('../pages/WanView.vue') },
      { path: 'wifi', name: 'wifi', component: () => import('../pages/WifiView.vue') },
      { path: 'clients', name: 'clients', component: () => import('../pages/ClientsView.vue') },
      { path: 'network', name: 'network', component: () => import('../pages/NetworkView.vue') },
      { path: 'system', name: 'system', component: () => import('../pages/SystemView.vue') }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHashHistory('/linkup/'),
  routes
})

// Auto-recover from stale lazy-chunk references after a firmware/UI update
// (cached index.html points at asset hashes that no longer exist -> reload fresh).
router.onError((err) => {
  const msg = String((err && err.message) || '')
  if (/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(msg)) {
    window.location.reload()
  }
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const session = useSessionStore()
  if (!session.isAuthed) {
    const ok = await session.validate()
    if (!ok) return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
