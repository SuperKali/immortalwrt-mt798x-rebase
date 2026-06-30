<script setup>
import Sparkline from './Sparkline.vue'
defineProps({
  icon: { type: [Object, Function], default: null },
  label: { type: String, default: '' },
  value: { type: String, default: '' },
  sub: { type: String, default: '' },
  gradient: { type: String, default: 'linear-gradient(135deg,#3b82f6,#6366f1)' },
  accent: { type: String, default: '#3b82f6' },
  spark: { type: Array, default: null },
  sparkMax: { type: Number, default: 0 }
})
</script>

<template>
  <div class="lk-card p-4 transition-shadow hover:shadow-md">
    <div class="flex items-center justify-between">
      <span class="text-xs text-fg2">{{ label }}</span>
      <div class="w-8 h-8 rounded-lg grid place-items-center text-white shrink-0" :style="{ background: gradient }">
        <component :is="icon" class="w-4 h-4" />
      </div>
    </div>
    <div class="text-2xl font-bold text-fg mt-1.5 leading-none truncate">{{ value }}</div>
    <Sparkline v-if="spark" :data="spark" :color="accent" :height="26" :max="sparkMax" class="mt-1.5" />
    <div v-else-if="sub" class="text-[11px] text-fg2 mt-1 truncate">{{ sub }}</div>
  </div>
</template>
