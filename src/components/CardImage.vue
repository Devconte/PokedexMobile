<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{ src: string | null; fallback?: string | null; quality?: 'low' | 'high'; alt?: string }>()
const step = ref(0)
const retried = ref(false)
watch(
  () => props.src,
  () => {
    step.value = 0
    retried.value = false
  },
)
const urls = computed(() => [props.src, props.fallback].filter(Boolean).map((u) => `${u}/${props.quality ?? 'low'}.webp`))
const url = computed(() => {
  const u = urls.value[step.value]
  return u && retried.value ? `${u}?retry` : (u ?? null)
})

// Une erreur réseau passagère ne doit pas afficher "Pas d'image" : on réessaie une fois avant l'image de secours.
function onError() {
  if (!retried.value) {
    setTimeout(() => (retried.value = true), 1500)
    return
  }
  retried.value = false
  step.value++
}
</script>

<template>
  <img v-if="url" :src="url" :alt="alt ?? ''" loading="lazy" decoding="async" class="cimg" @error="onError" />
  <div v-else class="cimg none"><span>Pas d'image</span></div>
</template>

<style scoped>
.cimg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.none {
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
  padding: 6px;
}
</style>
