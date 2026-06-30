<script setup>
import { computed } from 'vue'
const props = defineProps({
  data: { type: Array, default: () => [] },
  color: { type: String, default: '#3b82f6' },
  width: { type: Number, default: 240 },
  height: { type: Number, default: 56 },
  max: { type: Number, default: 0 }
})
const id = 'sg' + Math.random().toString(36).slice(2, 8)
const paths = computed(() => {
  const d = props.data
  const W = props.width, H = props.height
  if (!d.length) return { line: '', area: '' }
  const mx = props.max || Math.max(...d, 1)
  const step = d.length > 1 ? W / (d.length - 1) : W
  const pts = d.map((v, i) => [i * step, H - Math.min(1, v / mx) * (H - 3) - 2])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return { line, area: `${line} L${W},${H} L0,${H} Z` }
})
</script>

<template>
  <svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" class="block w-full" :style="{ height: height + 'px' }">
    <defs>
      <linearGradient :id="id" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="color" stop-opacity="0.3" />
        <stop offset="1" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="paths.area" :fill="`url(#${id})`" />
    <path :d="paths.line" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
</template>
