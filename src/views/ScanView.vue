<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import CardImage from '../components/CardImage.vue'
import CardSheet from '../components/CardSheet.vue'
import { cardLabel, entryForCard, speciesName } from '../lib/data'
import { interpret, scanImage, warmUp, type Hit, type ScanResult } from '../lib/scan'
import { useCollection } from '../stores/collection'

const col = useCollection()

const video = ref<HTMLVideoElement | null>(null)
const frame = ref<HTMLDivElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
let stream: MediaStream | null = null

const camState = ref<'off' | 'starting' | 'on' | 'error'>('off')
const camError = ref('')
const busy = ref(false)
const result = ref<ScanResult | null>(null)
const manual = ref('')
const sheet = ref<Hit | null>(null)
const err = ref('')

async function startCamera() {
  camError.value = ''
  if (!navigator.mediaDevices?.getUserMedia) {
    camState.value = 'error'
    camError.value = 'Caméra indisponible ici. Utilise « Prendre une photo ».'
    return
  }
  camState.value = 'starting'
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    camState.value = 'on'
    await nextTick()
    if (video.value) {
      video.value.srcObject = stream
      await video.value.play().catch(() => {})
    }
  } catch (e) {
    camState.value = 'error'
    camError.value =
      (e as Error).name === 'NotAllowedError'
        ? 'Accès à la caméra refusé. Autorise-le dans les réglages du navigateur, ou utilise « Prendre une photo ».'
        : 'Impossible d’ouvrir la caméra. Utilise « Prendre une photo ».'
  }
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  if (camState.value === 'on' || camState.value === 'starting') camState.value = 'off'
}

onMounted(() => {
  warmUp()
  startCamera()
})
onBeforeUnmount(stopCamera)

/** Recadre l'image de la caméra sur le cadre affiché à l'écran (la vidéo est en "object-fit: cover"). */
function captureFrame(): HTMLCanvasElement | null {
  const v = video.value
  const f = frame.value
  if (!v || !f || !v.videoWidth) return null
  const vr = v.getBoundingClientRect()
  const fr = f.getBoundingClientRect()
  const scale = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight)
  const offX = (vr.width - v.videoWidth * scale) / 2
  const offY = (vr.height - v.videoHeight * scale) / 2
  const sx = (fr.left - vr.left - offX) / scale
  const sy = (fr.top - vr.top - offY) / scale
  const sw = fr.width / scale
  const sh = fr.height / scale
  const c = document.createElement('canvas')
  c.width = Math.round(sw)
  c.height = Math.round(sh)
  c.getContext('2d')!.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height)
  return c
}

async function run(fn: () => Promise<ScanResult>) {
  busy.value = true
  err.value = ''
  try {
    result.value = await fn()
  } catch (e) {
    err.value = 'La lecture a échoué : ' + (e as Error).message
  } finally {
    busy.value = false
  }
}

function shoot() {
  const c = captureFrame()
  if (!c) return
  return run(() => scanImage(c, true))
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas')
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return run(() => scanImage(c, false))
}

/** Saisie à la main : "TG03/TG30", "143/142", "Dracaufeu 4/102"… */
function searchManual() {
  const q = manual.value.trim()
  if (q) result.value = interpret(q)
}

const hits = computed(() => result.value?.hits ?? [])
const owned = computed(() => new Map(col.rows.filter((r) => r.card_id).map((r) => [r.card_id!, r])))
const sheetOwned = computed(() => (sheet.value ? (owned.value.get(sheet.value.card.id) ?? null) : null))

async function act(fn: () => Promise<unknown>) {
  err.value = ''
  try {
    await fn()
  } catch (e) {
    err.value = (e as Error).message
  }
}
function add() {
  const h = sheet.value!
  const entry = entryForCard(h.card, h.dex)
  if (!entry) return
  return act(() => col.add(entry, h.card))
}
const remove = () => act(() => col.remove(sheetOwned.value!))
const feature = () => act(() => col.feature(sheetOwned.value!))
const setNote = (n: string) => act(() => col.patch(sheetOwned.value!, { note: n || null }))

function again() {
  result.value = null
  sheet.value = null
  if (camState.value !== 'on') startCamera()
}
</script>

<template>
  <div class="page">
    <h1>Scanner une carte</h1>

    <template v-if="!result">
      <div class="cam">
        <video v-if="camState === 'on' || camState === 'starting'" ref="video" playsinline muted autoplay />
        <div v-else class="camoff">
          <p v-if="camError" class="muted small">{{ camError }}</p>
          <button v-else class="btn" @click="startCamera">Ouvrir la caméra</button>
        </div>
        <div ref="frame" class="frame" :class="{ live: camState === 'on' }">
          <span class="hint top">Nom</span>
          <span class="hint bottom">Numéro (ex. 143/142)</span>
        </div>
        <div v-if="busy" class="busy"><span>Lecture en cours…</span></div>
      </div>
      <p class="muted small tip">Cadre la carte entière dans le rectangle, bien à plat et éclairée, puis appuie sur « Scanner ».</p>

      <div class="row">
        <button class="btn primary grow" :disabled="busy || camState !== 'on'" @click="shoot">Scanner</button>
        <button class="btn" :disabled="busy" @click="fileInput?.click()">Prendre une photo</button>
        <input ref="fileInput" type="file" accept="image/*" capture="environment" hidden @change="onFile" />
      </div>

      <form class="row manual" @submit.prevent="searchManual">
        <input v-model="manual" class="input grow" placeholder="Ou tape le numéro : TG03/TG30, Dracaufeu 4/102…" enterkeyhint="search" />
        <button class="btn" :disabled="!manual.trim()">OK</button>
      </form>
      <p v-if="err" class="error">{{ err }}</p>
    </template>

    <template v-else>
      <div class="summary card-panel">
        <p v-if="result.dex != null || result.numbers.length" class="small">
          Lu :
          <b v-if="result.dex != null">{{ speciesName(result.dex) }}</b>
          <template v-if="result.dex != null && result.numbers.length"> · </template>
          <b>{{ result.numbers.join(', ') }}</b>
        </p>
        <p v-else class="small">Je n’ai reconnu ni le nom ni le numéro.</p>
        <p v-if="hits.length > 1" class="muted small">Plusieurs cartes possibles : touche la bonne.</p>
        <p v-else-if="hits.length === 1" class="muted small">Touche la carte pour l’ajouter ou voir son prix.</p>
        <p v-else class="muted small">Essaie avec plus de lumière, en rapprochant la carte, ou tape le numéro à la main.</p>
        <div class="row">
          <button class="btn primary grow" @click="again">Scanner une autre carte</button>
          <RouterLink v-if="result.dex != null" :to="`/suivis/${result.dex}`" class="btn">Toutes ses cartes</RouterLink>
        </div>
        <form class="row" @submit.prevent="searchManual">
          <input v-model="manual" class="input grow" placeholder="Corriger : TG03/TG30, Dracaufeu 4/102…" enterkeyhint="search" />
          <button class="btn" :disabled="!manual.trim()">OK</button>
        </form>
        <details class="raw">
          <summary class="muted small">Texte lu</summary>
          <pre>{{ result.text.trim() || '(rien)' }}</pre>
        </details>
      </div>

      <div class="grid-cards">
        <button v-for="h in hits" :key="h.card.id" class="cardbtn" :class="{ have: owned.has(h.card.id) }" @click="sheet = h">
          <div class="card-ratio">
            <CardImage :src="h.card.img" :fallback="h.card.fallback" :card-id="h.card.id" :alt="h.card.name" />
            <span v-if="owned.has(h.card.id)" class="check">✓</span>
          </div>
          <span class="cname">{{ h.card.name }}</span>
          <span class="cset muted">{{ cardLabel(h.card).set }} · {{ cardLabel(h.card).num }}</span>
        </button>
      </div>
      <p v-if="err" class="error">{{ err }}</p>
    </template>

    <CardSheet
      v-if="sheet"
      :card="sheet.card"
      :owned="sheetOwned"
      @close="sheet = null"
      @add="add"
      @remove="remove"
      @feature="feature"
      @note="setNote"
    />
  </div>
</template>

<style scoped>
.cam {
  position: relative;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  aspect-ratio: 3 / 4;
  max-height: 62dvh;
  border-radius: 14px;
  overflow: hidden;
  background: #000;
}
.cam video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.camoff {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  text-align: center;
}
/* Cadre au format carte (63 × 88 mm). */
.frame {
  position: absolute;
  left: 50%;
  top: 50%;
  height: 86%;
  aspect-ratio: 63 / 88;
  max-width: 86%;
  transform: translate(-50%, -50%);
  border: 2px dashed #fff8;
  border-radius: 12px;
  box-shadow: 0 0 0 100vmax #0007;
}
.frame.live {
  border-color: #fff;
}
.hint {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.7rem;
  color: #fffc;
  pointer-events: none;
}
.hint.top {
  top: 4px;
}
.hint.bottom {
  bottom: 4px;
}
.busy {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: #000a;
  color: #fff;
  font-weight: 700;
}
.tip {
  text-align: center;
  margin: 8px 0 12px;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.grow {
  flex: 1;
  min-width: 0;
}
.manual {
  margin-top: 10px;
}
.summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}
.summary p {
  margin: 0;
}
.raw pre {
  white-space: pre-wrap;
  font-size: 0.72rem;
  color: var(--muted);
  margin: 6px 0 0;
}
.cardbtn {
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cardbtn .card-ratio {
  outline: 2px solid transparent;
  outline-offset: 1px;
}
.cardbtn.have .card-ratio {
  outline-color: var(--ok);
}
.check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--ok);
  color: #fff;
  font-weight: 800;
  display: grid;
  place-items: center;
  font-size: 0.85rem;
}
.cname {
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cset {
  font-size: 0.7rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.error {
  color: #ff6b6b;
}
</style>
