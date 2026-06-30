<script setup>
import { computed } from 'vue'
import { metricPercent, metricColor, metricUnit, METRIC_LABELS } from '../lib/signal'

const props = defineProps({ metric: String, value: { default: null } })
const has = computed(() => props.value !== null && props.value !== '' && !isNaN(props.value))
const pct = computed(() => metricPercent(props.metric, props.value))
const color = computed(() => metricColor(props.metric, props.value))
const label = computed(() => METRIC_LABELS[props.metric] || props.metric)
const unit = computed(() => metricUnit(props.metric))
</script>

<template>
  <div class="rounded-xl bg-muted px-3 py-2.5">
    <div class="flex items-baseline justify-between">
      <span class="text-[11px] font-medium text-fg2">{{ label }}</span>
      <span class="text-[10px] text-fg2">{{ unit }}</span>
    </div>
    <div class="text-lg font-semibold text-fg leading-tight">{{ has ? value : '—' }}</div>
    <div class="mt-1.5 h-1.5 rounded-full bg-border overflow-hidden">
      <div class="h-full rounded-full transition-all duration-500" :style="{ width: pct + '%', background: color }"></div>
    </div>
  </div>
</template>
