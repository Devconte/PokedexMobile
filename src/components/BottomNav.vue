<script setup lang="ts">
const items = [
  { to: '/', label: 'Pokédex', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 0 1 7.9 7h-4.1a4 4 0 0 0-7.6 0H4.1A8 8 0 0 1 12 4Zm0 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-7.9 3h4.1a4 4 0 0 0 7.6 0h4.1a8 8 0 0 1-15.8 0Z' },
  { to: '/stats', label: 'Stats', icon: 'M4 20V10h3v10H4Zm6 0V4h3v16h-3Zm6 0v-7h3v7h-3Z' },
  { to: '/compte', label: 'Compte', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z' },
]
</script>

<template>
  <nav class="nav">
    <RouterLink v-for="i in items" :key="i.to" :to="i.to" class="item" :exact-active-class="i.to === '/' ? 'on' : ''" :active-class="i.to === '/' ? '' : 'on'">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path :d="i.icon" fill="currentColor" /></svg>
      <span>{{ i.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  height: calc(var(--nav-h) + var(--safe-b));
  padding-bottom: var(--safe-b);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--line);
}
.item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 0.72rem;
  color: var(--muted);
}
.item.on {
  color: var(--accent);
}
</style>
