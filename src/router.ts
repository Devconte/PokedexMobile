import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './stores/auth'
import PokedexView from './views/PokedexView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: PokedexView },
    { path: '/p/:id', component: () => import('./views/EntryView.vue') },
    { path: '/suivis', component: () => import('./views/FollowsView.vue') },
    { path: '/suivis/:dex(\\d+)', component: () => import('./views/TrackView.vue') },
    { path: '/stats', component: () => import('./views/StatsView.vue') },
    { path: '/compte', component: () => import('./views/AccountView.vue') },
    { path: '/import', component: () => import('./views/ImportView.vue') },
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(_to, _from, saved) {
    return saved ?? { top: 0 }
  },
})

router.beforeEach((to) => {
  const auth = useAuth()
  if (!to.meta.public && !auth.isAuthed()) return '/login'
  if (to.path === '/login' && auth.isAuthed()) return '/'
})
