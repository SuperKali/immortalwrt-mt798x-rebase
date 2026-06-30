<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Menu, Moon, Sun, LogOut } from 'lucide-vue-next'
import { useUiStore } from '../stores/ui'
import { useSessionStore } from '../stores/session'
import { useModemStore } from '../stores/modem'

const ui = useUiStore()
const session = useSessionStore()
const modem = useModemStore()
const router = useRouter()

const online = computed(() => modem.online)
const isDark = computed(() =>
  ui.theme === 'dark' ||
  (ui.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches))

function logout() { session.logout(); router.push({ name: 'login' }) }
function toggleLang() { ui.setLocale(ui.locale === 'it' ? 'en' : 'it') }
</script>

<template>
  <header class="h-14 sticky top-0 z-30 bg-card backdrop-blur border-b border-border flex items-center gap-3 px-4">
    <button class="lg:hidden p-2 -ml-2 text-fg2 hover:text-fg" @click="ui.sidebarOpen = true">
      <Menu class="w-5 h-5" />
    </button>
    <div class="flex items-center gap-2 text-sm">
      <span class="w-2.5 h-2.5 rounded-full" :class="online ? 'bg-q-ex' : 'bg-q-poor'"
        :style="online ? 'box-shadow:0 0 0 3px rgba(16,185,129,.18)' : ''"></span>
      <span class="text-fg2 hidden sm:inline">{{ online ? $t('common.online') : $t('common.offline') }}</span>
    </div>
    <div class="ml-auto flex items-center gap-1">
      <button class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-fg2 hover:bg-muted" @click="toggleLang">
        {{ ui.locale.toUpperCase() }}
      </button>
      <button class="p-2 rounded-lg text-fg2 hover:bg-muted" @click="ui.toggleTheme()">
        <Sun v-if="isDark" class="w-5 h-5" /><Moon v-else class="w-5 h-5" />
      </button>
      <button class="p-2 rounded-lg text-fg2 hover:bg-muted" @click="logout" :title="$t('common.logout')">
        <LogOut class="w-5 h-5" />
      </button>
    </div>
  </header>
</template>
