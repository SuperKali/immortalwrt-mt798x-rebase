<template>
  <span class="inline-flex gap-[3px] items-end h-4 align-middle" aria-label="loading">
    <span v-for="i in 3" :key="i" class="w-1 h-full bg-current rounded-full"
      :style="{ animation: 'lkbounce 0.9s ease-in-out infinite', animationDelay: (i * 0.12) + 's' }"></span>
  </span>
</template>

<style>
@keyframes lkbounce {
  0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
  50% { transform: scaleY(1); opacity: 1; }
}
</style>
