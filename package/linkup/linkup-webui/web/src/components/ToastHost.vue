<script setup>
import { useUiStore } from '../stores/ui'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-vue-next'
const ui = useUiStore()
const icons = { success: CheckCircle2, error: AlertCircle, info: Info }
</script>

<template>
  <div class="fixed z-[60] bottom-4 right-4 flex flex-col gap-2 max-w-[92vw]">
    <transition-group name="toast">
      <div v-for="t in ui.toasts" :key="t.id"
        class="lk-card flex items-center gap-3 pl-3 pr-2 py-2.5 min-w-[260px]"
        :class="{ 'border-q-poor': t.type === 'error', 'border-q-ex': t.type === 'success' }">
        <component :is="icons[t.type] || icons.info" class="w-5 h-5 shrink-0"
          :class="{ 'text-q-poor': t.type === 'error', 'text-q-ex': t.type === 'success', 'text-accent': t.type === 'info' }" />
        <span class="text-sm text-fg flex-1">{{ t.message }}</span>
        <button class="p-1 text-fg2 hover:text-fg" @click="ui.dismiss(t.id)"><X class="w-4 h-4" /></button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all .25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
