<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { luci, wifi, net } from '../api/linkup'
import { useUiStore } from '../stores/ui'
import { usePolling } from '../composables/usePolling'
import PageHeader from '../components/PageHeader.vue'
import Spinner from '../components/Spinner.vue'
import SignalBars from '../components/SignalBars.vue'
import { RefreshCw, Wifi as WifiIcon, WifiOff, Cable, Clock, Unplug } from 'lucide-vue-next'

const { t } = useI18n()
const ui = useUiStore()
const leases = ref([])
const hints = ref({})
const stations = ref([])
const lanLinks = ref([])
const loading = ref(true)
const kicking = ref('')

async function load() {
  try {
    const l = await luci.dhcpLeases(); leases.value = (l && (l.dhcp_leases || l.leases)) || []
    try { const h = await luci.hostHints(); hints.value = (h && h.hosts) || h || {} } catch (_) {}
    try { const c = await wifi.clients(); stations.value = c.clients || [] } catch (_) {}
    try { const n = await net.lanLinks(); lanLinks.value = n.links || [] } catch (_) {}
  } catch (_) {} finally { loading.value = false }
}
onMounted(load)
usePolling(load, 10000)

const bandOf = (ifn) => (ifn === 'ra0' ? '2.4 GHz' : ifn === 'rax0' ? '5 GHz' : ifn ? '6 GHz' : null)
const stByMac = computed(() => {
  const m = {}
  for (const s of stations.value) m[String(s.mac || '').toUpperCase()] = s
  return m
})
const lanByMac = computed(() => {
  const m = {}
  for (const l of lanLinks.value) m[String(l.mac || '').toUpperCase()] = l
  return m
})
const rows = computed(() => leases.value.map((l) => {
  const mac = String(l.macaddr || l.mac || '').toUpperCase()
  const st = stByMac.value[mac]
  const link = lanByMac.value[mac]
  const hint = hints.value[mac]
  return {
    name: l.hostname || (hint && hint.name) || '—', ip: l.ipaddr || l.ip || '—', mac,
    expires: l.expires != null ? l.expires : null,
    wifi: !!st, wired: !st && !!link, ifname: st && st.ifname, band: st ? bandOf(st.ifname) : null,
    signal: st && st.signal, std: st && st.std,
    rate: st && st.tx_rate ? Math.round(st.tx_rate / 1000) : null,
    nss: st && st.nss,
    speed: link ? link.speed : 0, port: link && link.port
  }
}).sort((a, b) => {
  const rank = (r) => (r.wifi ? 0 : r.wired ? 1 : 2)
  return rank(a) - rank(b) || a.name.localeCompare(b.name)
}))
const wifiCount = computed(() => rows.value.filter((r) => r.wifi).length)
const wiredCount = computed(() => rows.value.filter((r) => r.wired).length)

function speedLabel(s) {
  if (!s || s <= 0) return 'Ethernet'
  return s >= 1000 ? (s / 1000) + ' Gbps' : s + ' Mbps'
}
const pct = (dbm) => (dbm == null ? 0 : Math.max(0, Math.min(100, Math.round((dbm + 90) / 55 * 100))))

async function kick(r) {
  if (!r.ifname) return
  kicking.value = r.mac
  try { await wifi.kick(r.ifname, r.mac); ui.toast(t('clients.disconnect') + ' · ' + r.name, 'info'); setTimeout(load, 1500) }
  catch (e) { ui.toast(e.message, 'error') } finally { kicking.value = '' }
}
</script>

<template>
  <div>
    <PageHeader :title="$t('clients.title')">
      <template #actions><button class="lk-btn-ghost" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button></template>
    </PageHeader>

    <div v-if="loading" class="lk-card p-10 grid place-items-center text-fg2"><Spinner /></div>
    <div v-else-if="!rows.length" class="lk-card p-10 text-center text-fg2 text-sm">{{ $t('clients.empty') }}</div>
    <div v-else class="lk-card overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <span class="text-sm font-semibold text-fg">{{ rows.length }} {{ $t('nav.clients') }}</span>
        <span class="text-[11px] text-fg2 flex items-center gap-1.5"><WifiIcon class="w-3.5 h-3.5" />{{ wifiCount }} · <Cable class="w-3.5 h-3.5" />{{ wiredCount }}</span>
      </div>

      <div class="divide-y divide-border">
        <div v-for="r in rows" :key="r.mac" class="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition" :class="{ 'opacity-55': !r.wifi && !r.wired }">
          <!-- icon -->
          <div class="w-9 h-9 rounded-[10px] grid place-items-center shrink-0"
            :style="r.wifi ? 'background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)' : 'background:var(--muted);color:var(--fg-2)'">
            <component :is="r.wifi ? WifiIcon : (r.wired ? Cable : WifiOff)" class="w-[18px] h-[18px]" />
          </div>
          <!-- identity -->
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-fg truncate">{{ r.name }}</div>
            <div class="text-[11px] text-fg2 font-mono truncate">{{ r.ip }} · {{ r.mac }}</div>
          </div>
          <!-- connection: fixed-width right-aligned block (columns align across rows) -->
          <div class="hidden sm:block text-right shrink-0 w-44 leading-tight">
            <template v-if="r.wifi">
              <div class="flex items-center justify-end gap-1.5">
                <SignalBars :percent="pct(r.signal)" />
                <span class="text-[11px] font-mono text-fg2 w-12 text-right">{{ r.signal }} dBm</span>
              </div>
              <div class="text-[11px] text-fg3 truncate mt-0.5">{{ r.band }} · {{ r.std }}<span v-if="r.rate"> · {{ r.rate }} Mbps</span></div>
            </template>
            <template v-else-if="r.wired">
              <div class="text-sm font-semibold" :style="r.speed >= 1000 ? 'color:var(--q-ex)' : 'color:var(--fg-2)'">{{ speedLabel(r.speed) }}</div>
              <div class="text-[11px] text-fg3 font-mono mt-0.5">{{ r.port || 'LAN' }}</div>
            </template>
            <template v-else>
              <div class="text-[11px] text-fg3">{{ $t('common.offline') }}</div>
            </template>
          </div>
          <!-- lease -->
          <div class="hidden md:flex items-center gap-1 w-16 justify-end text-[11px] text-fg2 shrink-0" :title="$t('clients.lease')">
            <Clock class="w-3 h-3 text-fg3" />{{ r.expires == null ? '—' : (r.expires < 0 ? '∞' : (r.expires < 3600 ? Math.round(r.expires / 60) + 'm' : Math.floor(r.expires / 3600) + 'h')) }}
          </div>
          <!-- disconnect (wifi only) -->
          <button v-if="r.wifi" @click="kick(r)" :disabled="kicking === r.mac" :title="$t('clients.disconnect')"
            class="text-fg3 hover:text-destructive p-1.5 shrink-0 disabled:opacity-40">
            <Spinner v-if="kicking === r.mac" /><Unplug v-else class="w-4 h-4" />
          </button>
          <span v-else class="w-7 shrink-0"></span>
        </div>
      </div>
    </div>
  </div>
</template>
