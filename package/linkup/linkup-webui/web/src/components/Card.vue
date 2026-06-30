<script setup>
defineProps({ title: String, icon: [Object, Function] })
</script>

<template>
  <section class="lk-card p-4 sm:p-5">
    <header v-if="title || $slots.header || $slots.actions" class="flex items-center gap-2 mb-4">
      <component :is="icon" v-if="icon" class="w-5 h-5 text-accent shrink-0" />
      <h2 v-if="title" class="text-sm font-semibold text-fg flex-1">{{ title }}</h2>
      <slot name="header" />
      <div class="ml-auto flex items-center gap-2"><slot name="actions" /></div>
    </header>
    <slot />
  </section>
</template>
