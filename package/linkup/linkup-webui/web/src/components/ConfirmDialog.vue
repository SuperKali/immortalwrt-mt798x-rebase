<script setup>
defineProps({ open: Boolean, title: String, message: String, danger: Boolean, confirmLabel: String })
const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <transition name="fade">
    <div v-if="open" class="fixed inset-0 z-50 grid place-items-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="emit('cancel')"></div>
      <div class="lk-card relative w-full max-w-sm p-5">
        <h3 class="font-semibold text-fg mb-1">{{ title }}</h3>
        <p class="text-sm text-fg2 mb-4">{{ message }}</p>
        <div class="flex justify-end gap-2">
          <button class="lk-btn-ghost" @click="emit('cancel')">{{ $t('common.cancel') }}</button>
          <button :class="danger ? 'lk-btn-danger' : 'lk-btn-primary'" @click="emit('confirm')">
            {{ confirmLabel || $t('common.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .15s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
