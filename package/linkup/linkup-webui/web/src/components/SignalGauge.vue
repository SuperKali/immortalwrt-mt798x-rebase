<script setup>
import { computed } from 'vue'
import { metricPercent, metricColor, metricUnit, METRIC_LABELS } from '../lib/signal'

const props = defineProps({
  metric: { type: String, required: true },
  value: { default: null }
})

const R = 52, CX = 64, CY = 64
const C = 2 * Math.PI * R
const SWEEP = 0.75 // 270 degrees
const dash = `${SWEEP * C} ${C}`

const has = computed(() => props.value !== null && props.value !== '' && !isNaN(props.value))
const pct = computed(() => metricPercent(props.metric, props.value))
const color = computed(() => metricColor(props.metric, props.value))
const offset = computed(() => SWEEP * C * (1 - pct.value / 100))
const label = computed(() => METRIC_LABELS[props.metric] || props.metric)
const unit = computed(() => metricUnit(props.metric))
</script>

<template>
  <div class="flex flex-col items-center">
    <svg viewBox="0 0 128 128" class="w-24 h-24 sm:w-28 sm:h-28">
      <g :transform="`rotate(135 ${CX} ${CY})`">
        <circle :cx="CX" :cy="CY" :r="R" fill="none" stroke="var(--q-none)" stroke-width="9"
          stroke-linecap="round" :stroke-dasharray="dash" />
        <circle v-if="has" :cx="CX" :cy="CY" :r="R" fill="none" :stroke="color" stroke-width="9"
          stroke-linecap="round" :stroke-dasharray="dash" :stroke-dashoffset="offset"
          style="transition: stroke-dashoffset .5s ease, stroke .3s ease" />
      </g>
      <text :x="CX" :y="CY - 1" text-anchor="middle" fill="var(--fg)"
        style="font-size:22px;font-weight:700">{{ has ? value : '—' }}</text>
      <text :x="CX" :y="CY + 16" text-anchor="middle" fill="var(--fg-2)" style="font-size:11px">{{ unit }}</text>
    </svg>
    <div class="text-xs font-medium text-fg2 -mt-2">{{ label }}</div>
  </div>
</template>
