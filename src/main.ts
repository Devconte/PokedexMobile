import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { loadData } from './lib/data'
import { router } from './router'
import { useAuth } from './stores/auth'
import { useCollection } from './stores/collection'

async function start() {
  const app = createApp(App)
  app.use(createPinia())
  const auth = useAuth()
  await Promise.all([loadData(), auth.init()])
  if (auth.isAuthed()) useCollection().load()
  app.use(router)
  await router.isReady()
  app.mount('#app')
}

start().catch((e) => {
  document.getElementById('app')!.innerHTML = `<p style="padding:24px">Impossible de charger l'application : ${String(e?.message ?? e)}</p>`
})
