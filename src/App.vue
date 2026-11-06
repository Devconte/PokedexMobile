<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BottomNav from './components/BottomNav.vue'

const route = useRoute()
const showNav = computed(() => route.path !== '/login')
</script>

<template>
  <RouterView v-slot="{ Component }">
    <KeepAlive include="PokedexView">
      <component :is="Component" :key="route.path.startsWith('/p/') ? 'entry' : route.path" />
    </KeepAlive>
  </RouterView>
  <BottomNav v-if="showNav" />
</template>
