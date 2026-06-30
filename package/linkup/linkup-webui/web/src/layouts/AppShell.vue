<script setup>
import { useUiStore } from '../stores/ui'
import { useModemStore } from '../stores/modem'
import { usePolling } from '../composables/usePolling'
import Sidebar from './Sidebar.vue'
import TopBar from './TopBar.vue'

const ui = useUiStore()
const modem = useModemStore()
// Keep the top-bar online indicator accurate on every page (pages that need
// faster data, e.g. Dashboard/Modem, run their own 5s poll on top of this).
usePolling(() => modem.refresh(), 15000)
</script>

<template>
  <div class="min-h-full flex bg-bg">
    <Sidebar class="hidden lg:flex" />

    <transition name="drawer">
      <div v-if="ui.sidebarOpen" class="fixed inset-0 z-40 lg:hidden">
        <div class="absolute inset-0 bg-black/40" @click="ui.sidebarOpen = false"></div>
        <Sidebar class="absolute left-0 top-0 h-full shadow-2xl" @navigate="ui.sidebarOpen = false" />
      </div>
    </transition>

    <div class="flex-1 min-w-0 flex flex-col">
      <TopBar />
      <main class="flex-1 w-full">
        <div class="max-w-[1600px] mx-auto p-4 sm:p-6">
          <router-view v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .15s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
.drawer-enter-active, .drawer-leave-active { transition: opacity .2s }
.drawer-enter-from, .drawer-leave-to { opacity: 0 }
</style>
