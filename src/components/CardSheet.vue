<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CardImage from './CardImage.vue'
import { cardLabel } from '../lib/data'
import type { Card, Owned } from '../lib/types'

const props = defineProps<{ card: Card; owned: Owned | null }>()
const emit = defineEmits<{ close: []; add: []; remove: []; feature: []; note: [string] }>()
const info = computed(() => cardLabel(props.card))
const note = ref(props.owned?.note ?? '')
watch(
  () => props.owned,
  (o) => (note.value = o?.note ?? ''),
)
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="sheet" role="dialog" :aria-label="card.name">
      <div class="big card-ratio"><CardImage :src="card.img" :fallback="card.fallback" :card-id="card.id" quality="high" :alt="card.name" /></div>
      <div class="body">
        <h2>{{ card.name }}</h2>
        <p class="muted small">{{ info.set }} · {{ info.num }}<template v-if="info.year"> · {{ info.year }}</template></p>
        <template v-if="owned">
          <p class="ok">✓ Dans ta collection<template v-if="owned.featured"> · ★ affichée dans le Pokédex</template></p>
          <textarea v-model="note" class="input" rows="2" placeholder="Note (reverse, état, gradée…)" @change="emit('note', note)" />
          <div class="actions">
            <button v-if="!owned.featured" class="btn primary" @click="emit('feature')">★ Afficher dans le Pokédex</button>
            <button class="btn danger" @click="emit('remove')">Retirer</button>
          </div>
        </template>
        <div v-else class="actions">
          <button class="btn primary block" @click="emit('add')">+ Je l'ai</button>
        </div>
        <button class="btn block" @click="emit('close')">Fermer</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: #000b;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-width: 520px;
  max-height: 94dvh;
  overflow-y: auto;
  background: var(--surface);
  border-radius: 18px 18px 0 0;
  padding: 16px 16px calc(16px + var(--safe-b));
}
@media (min-width: 700px) {
  .backdrop {
    align-items: center;
  }
  .sheet {
    border-radius: 18px;
  }
}
.big {
  width: min(72%, 300px);
  margin: 0 auto;
  border-radius: 12px;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.body h2 {
  margin: 12px 0 0;
}
.body p {
  margin: 0;
}
.ok {
  color: var(--ok);
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.actions .btn {
  flex: 1;
}
</style>
