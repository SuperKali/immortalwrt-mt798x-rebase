<script setup>
import { computed } from 'vue'
import { techGradient } from '../lib/bands'
const props = defineProps({ tech: { type: String, default: '' } })
const grad = computed(() => techGradient(props.tech))
</script>

<template>
  <span class="lk-pill text-white font-semibold tracking-wide shadow-sm"
    :style="{ background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})` }">
    {{ tech || '—' }}
  </span>
</template>
