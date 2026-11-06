<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ptcgImage } from '../lib/data'

const props = defineProps<{
  src: string | null
  fallback?: string | null
  /** Id TCGdex de la carte : sert à chercher une image sur pokemontcg.io si TCGdex n'en a pas. */
  cardId?: string | null
  quality?: 'low' | 'high'
  alt?: string
}>()
const step = ref(0)
const retried = ref(false)
watch(
  () => [props.src, props.cardId],
  () => {
    step.value = 0
    retried.value = false
  },
)

// Ordre : image TCGdex FR -> TCGdex EN -> pokemontcg.io.
const urls = computed(() => {
  const q = props.quality ?? 'low'
  const bases = [props.src, props.fallback, props.src?.includes('/fr/') ? props.src.replace('/fr/', '/en/') : null]
  const list = [...new Set(bases.filter((b): b is string => !!b))].map((b) => (b.includes('://assets.tcgdex.net/') ? `${b}/${q}.webp` : b))
  const extra = props.cardId ? ptcgImage(props.cardId, q) : null
  if (extra) list.push(extra)
  return list
})
const url = computed(() => {
  const u = urls.value[step.value]
  return u && retried.value ? `${u}?retry` : (u ?? null)
})

// Une erreur réseau passagère ne doit pas afficher "Pas d'image" : on réessaie une fois avant l'image suivante.
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
