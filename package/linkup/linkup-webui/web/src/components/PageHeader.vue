<script setup>
defineProps({ title: String, subtitle: String })
</script>

<template>
  <div class="mb-5 flex items-end justify-between gap-3 flex-wrap">
    <div>
      <h1 class="text-lg font-semibold text-fg">{{ title }}</h1>
      <p v-if="subtitle" class="text-sm text-fg2 mt-0.5">{{ subtitle }}</p>
    </div>
    <div class="flex items-center gap-2"><slot name="actions" /></div>
  </div>
</template>
