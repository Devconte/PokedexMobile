<script setup lang="ts">
import { computed } from 'vue'
import CardImage from './CardImage.vue'
import { useCollection } from '../stores/collection'
import { FORM_LABEL } from '../lib/forms'
import { artwork, pad } from '../lib/text'
import type { Entry } from '../lib/types'

const props = defineProps<{ entry: Entry }>()
const col = useCollection()
const display = computed(() => col.display.get(props.entry.id) ?? null)
const form = computed(() => FORM_LABEL[props.entry.form] + (props.entry.variant ? ` ${props.entry.variant}` : ''))
</script>

<template>
  <RouterLink :to="`/p/${entry.id}`" class="tile" :class="{ owned: display }">
    <div class="card-ratio thumb">
      <CardImage v-if="display?.kind === 'card'" :src="display.img" :card-id="display.cardId" :alt="entry.name" />
      <img v-else :src="artwork(entry.dex)" :alt="entry.name" loading="lazy" class="art" :class="{ ghost: !display }" />
      <span v-if="display?.kind === 'unknown'" class="badge" title="Carte à identifier">?</span>
      <span v-if="form" class="form">{{ form }}</span>
    </div>
    <div class="meta">
      <span class="num">#{{ pad(entry.dex) }}</span>
      <span class="name">{{ entry.name }}</span>
    </div>
  </RouterLink>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.thumb {
  border: 1px solid var(--line);
}
.owned .thumb {
  border-color: transparent;
}
.art {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 14% 8%;
}
.art.ghost {
  filter: grayscale(1) brightness(0.55);
  opacity: 0.45;
}
.badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--warn);
  color: #000;
  font-weight: 800;
  font-size: 0.8rem;
  display: grid;
  place-items: center;
}
.form {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 0.65rem;
  font-weight: 700;
  background: #000a;
  color: #fff;
  padding: 2px 6px;
  border-radius: 99px;
}
.meta {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
}
.num {
  font-size: 0.7rem;
  color: var(--muted);
}
.name {
  font-size: 0.8rem;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
