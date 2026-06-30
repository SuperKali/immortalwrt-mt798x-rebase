<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  series: { type: Array, default: () => [] }, // [{ data:[], color, fill }]
  height: { type: Number, default: 150 },
  min: { type: Number, default: null },
  max: { type: Number, default: null },
  grid: { type: Number, default: 4 },
  decimals: { type: Number, default: 0 },
  axis: { type: Boolean, default: true }
})

const wrap = ref(null)
const W = ref(560)
let ro
function measure() {
  if (!wrap.value) return
  const w = wrap.value.getBoundingClientRect().width || wrap.value.clientWidth
  if (w && Math.abs(w - W.value) > 0.5) W.value = Math.round(w)
}
onMounted(() => {
  measure()
  requestAnimationFrame(measure)
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure)
    ro.observe(wrap.value)
  }
})
onBeforeUnmount(() => ro && ro.disconnect())

const PAD = computed(() => ({ t: 8, r: 6, b: 6, l: props.axis ? 36 : 6 }))
const vals = computed(() => props.series.flatMap((s) => s.data).filter((v) => v != null))
const lo = computed(() => (props.min != null ? props.min : (vals.value.length ? Math.min(...vals.value) : 0)))
const hi = computed(() => (props.max != null ? props.max : (vals.value.length ? Math.max(...vals.value) : 1)))
const span = computed(() => (hi.value - lo.value) || 1)

function xAt(i, n) { const w = W.value - PAD.value.l - PAD.value.r; return PAD.value.l + (n <= 1 ? 0 : (i / (n - 1)) * w) }
function yAt(v) { const h = props.height - PAD.value.t - PAD.value.b; return PAD.value.t + (1 - (v - lo.value) / span.value) * h }

function smooth(data) {
  const pts = data.map((v, i) => [xAt(i, data.length), yAt(v)])
  if (pts.length < 2) return pts.length ? `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}` : ''
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

const lines = computed(() => props.series.map((s, si) => {
  const line = smooth(s.data)
  const n = s.data.length
  return {
    color: s.color,
    d: line,
    area: s.fill && n > 1 ? `${line} L${xAt(n - 1, n).toFixed(1)},${(props.height - PAD.value.b).toFixed(1)} L${xAt(0, n).toFixed(1)},${(props.height - PAD.value.b).toFixed(1)} Z` : '',
    id: 'lc' + si + Math.random().toString(36).slice(2, 6),
    lastX: n ? xAt(n - 1, n) : 0,
    lastY: n ? yAt(s.data[n - 1]) : 0,
    has: n > 0
  }
}))
const gridLines = computed(() => {
  const out = []
  if (props.grid < 1) return out
  for (let i = 0; i <= props.grid; i++) {
    const v = lo.value + span.value * (1 - i / props.grid)
    out.push({ y: yAt(v), label: v.toFixed(props.decimals) })
  }
  return out
})
</script>

<template>
  <div ref="wrap" class="w-full overflow-hidden">
    <svg :viewBox="`0 0 ${W} ${height}`" width="100%" :height="height" class="block max-w-full">
      <defs>
        <linearGradient v-for="l in lines" :key="l.id" :id="l.id" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="l.color" stop-opacity="0.22" />
          <stop offset="1" :stop-color="l.color" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g>
        <line v-for="(g, i) in gridLines" :key="i" :x1="PAD.l" :x2="W - PAD.r" :y1="g.y" :y2="g.y"
          stroke="var(--border)" stroke-width="1" stroke-dasharray="2 4" />
        <text v-if="axis" v-for="(g, i) in gridLines" :key="'t' + i" :x="PAD.l - 6" :y="g.y + 3"
          text-anchor="end" font-size="9" fill="var(--fg-2)">{{ g.label }}</text>
      </g>
      <template v-for="l in lines" :key="l.id + 'p'">
        <path v-if="l.area" :d="l.area" :fill="`url(#${l.id})`" />
        <path :d="l.d" fill="none" :stroke="l.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <circle v-if="l.has" :cx="l.lastX" :cy="l.lastY" r="3" :fill="l.color" />
      </template>
    </svg>
  </div>
</template>
