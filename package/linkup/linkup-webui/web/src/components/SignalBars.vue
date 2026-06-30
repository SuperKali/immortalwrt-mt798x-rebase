<script setup>
import { computed } from 'vue'
import { signalBars } from '../lib/signal'
const props = defineProps({ percent: { type: [Number, String], default: 0 } })
const info = computed(() => signalBars(props.percent))
const heights = [7, 10, 13, 16, 19]
</script>

<template>
  <span class="inline-flex items-end gap-[3px]" :title="info.label">
    <span v-for="i in 5" :key="i" class="w-[5px] rounded-sm transition-all"
      :style="{ height: heights[i - 1] + 'px', background: i <= info.bars ? info.color : 'var(--q-none)' }"></span>
  </span>
</template>
