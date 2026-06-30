<script setup>
defineProps({ modelValue: Boolean, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <button type="button" role="switch" :aria-checked="modelValue" :disabled="disabled"
    class="relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 shrink-0"
    :class="modelValue ? 'bg-accent' : 'bg-border'"
    @click="emit('update:modelValue', !modelValue)">
    <span class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
      :class="modelValue ? 'translate-x-[22px]' : 'translate-x-0.5'"></span>
  </button>
</template>
