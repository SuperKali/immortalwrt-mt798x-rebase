<script setup>
import { computed } from 'vue'
const props = defineProps({
  percent: { type: Number, default: 0 },
  value: { type: String, default: '' },
  label: { type: String, default: '' },
  color: { type: String, default: '#3b82f6' },
  size: { type: Number, default: 88 }
})
const R = 40
const C = 2 * Math.PI * R
const dash = computed(() => `${Math.max(0, Math.min(100, props.percent)) / 100 * C} ${C}`)
</script>

<template>
  <div class="flex flex-col items-center">
    <div class="relative" :style="{ width: size + 'px', height: size + 'px' }">
      <svg viewBox="0 0 100 100" class="w-full h-full -rotate-90">
        <circle cx="50" cy="50" :r="R" fill="none" stroke="var(--muted)" stroke-width="9" />
        <circle cx="50" cy="50" :r="R" fill="none" :stroke="color" stroke-width="9" stroke-linecap="round"
          :stroke-dasharray="dash" style="transition:stroke-dasharray .6s ease" />
      </svg>
      <div class="absolute inset-0 grid place-items-center">
        <span class="text-base font-bold text-fg">{{ value }}</span>
      </div>
    </div>
    <span class="text-xs text-fg2 mt-1.5">{{ label }}</span>
  </div>
</template>
