<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  LayoutDashboard, RadioTower, Radio, MessageSquare, Hash, Terminal,
  CreditCard, Globe, Wifi, Users, Network, Settings, ExternalLink, Cable, ChevronDown
} from 'lucide-vue-next'

defineEmits(['navigate'])
const route = useRoute()
const isActive = (name) => route.name === name

const nav = [
  { name: 'dashboard', icon: LayoutDashboard, label: 'nav.dashboard' },
  {
    group: 'nav.cellular', icon: RadioTower, children: [
      { name: 'cellular', icon: Radio, label: 'nav.modem' },
      { name: 'bands', icon: RadioTower, label: 'nav.bands' },
      { name: 'sms', icon: MessageSquare, label: 'nav.sms' },
      { name: 'ussd', icon: Hash, label: 'nav.ussd' },
      { name: 'at', icon: Terminal, label: 'nav.at' },
      { name: 'esim', icon: CreditCard, label: 'nav.esim' }
    ]
  },
  {
    group: 'nav.network', icon: Network, children: [
      { name: 'wifi', icon: Wifi, label: 'nav.wifi' },
      { name: 'clients', icon: Users, label: 'nav.clients' },
      { name: 'internet', icon: Globe, label: 'nav.internet' },
      { name: 'network', icon: Cable, label: 'nav.lan' }
    ]
  },
  { name: 'system', icon: Settings, label: 'nav.system' }
]

// collapsible group dropdowns (state persisted)
let saved = {}
try { saved = JSON.parse(localStorage.getItem('linkup_nav_open') || '{}') } catch (_) {}
const open = ref({})
for (const item of nav) {
  if (item.group) open.value[item.group] = item.group in saved ? saved[item.group] : true
}
// always reveal the group that holds the current page
for (const item of nav) {
  if (item.group && item.children.some((c) => c.name === route.name)) open.value[item.group] = true
}
function toggle(g) {
  open.value[g] = !open.value[g]
  try { localStorage.setItem('linkup_nav_open', JSON.stringify(open.value)) } catch (_) {}
}
const linkCls = 'flex items-center gap-3 px-3 py-2 rounded-lg transition'
</script>

<template>
  <aside class="w-60 shrink-0 bg-card border-r border-border flex flex-col z-50">
    <div class="h-14 flex items-center gap-2.5 px-5 border-b border-border">
      <div class="w-7 h-7 rounded-lg grid place-items-center text-white font-bold text-sm"
        style="background: linear-gradient(135deg,#0066ff,#0049b8)">L</div>
      <span class="font-semibold text-fg">{{ $t('brand') }}</span>
    </div>

    <nav class="flex-1 overflow-y-auto py-3 px-3 space-y-0.5 text-sm">
      <template v-for="item in nav" :key="item.name || item.group">
        <RouterLink v-if="item.name" :to="{ name: item.name }" @click="$emit('navigate')" :class="[linkCls,
          isActive(item.name) ? 'bg-accent-soft text-accent font-medium' : 'text-fg2 hover:bg-muted hover:text-fg']">
          <component :is="item.icon" class="w-[18px] h-[18px]" />{{ $t(item.label) }}
        </RouterLink>
        <div v-else class="pt-2.5">
          <button type="button" @click="toggle(item.group)"
            class="w-full px-3 py-1 text-[11px] uppercase tracking-wide text-fg2 hover:text-fg flex items-center gap-2 rounded">
            <component :is="item.icon" class="w-[14px] h-[14px]" />
            <span class="flex-1 text-left">{{ $t(item.group) }}</span>
            <ChevronDown class="w-3.5 h-3.5 transition-transform" :class="open[item.group] ? '' : '-rotate-90'" />
          </button>
          <div v-show="open[item.group]" class="mt-0.5 space-y-0.5">
            <RouterLink v-for="c in item.children" :key="c.name" :to="{ name: c.name }" @click="$emit('navigate')"
              :class="[linkCls, 'pl-7',
                isActive(c.name) ? 'bg-accent-soft text-accent font-medium' : 'text-fg2 hover:bg-muted hover:text-fg']">
              <component :is="c.icon" class="w-[18px] h-[18px]" />{{ $t(c.label) }}
            </RouterLink>
          </div>
        </div>
      </template>
    </nav>

    <a href="/cgi-bin/luci/" class="flex items-center gap-3 px-5 py-3 border-t border-border text-fg2 hover:text-fg text-sm">
      <ExternalLink class="w-[18px] h-[18px]" />{{ $t('nav.advanced') }}
    </a>
  </aside>
</template>
