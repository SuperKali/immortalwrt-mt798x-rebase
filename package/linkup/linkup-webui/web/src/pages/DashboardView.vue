<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useModemStore } from '../stores/modem'
import { useHistoryStore } from '../stores/history'
import { system as sysApi, net as netApi, luci, dev, wifi } from '../api/linkup'
import { usePolling } from '../composables/usePolling'
import { fmtDuration, fmtRate } from '../lib/format'
import LineChart from '../components/LineChart.vue'
import SignalBars from '../components/SignalBars.vue'
import Skeleton from '../components/Skeleton.vue'
import {
  Globe, Users, ArrowRight, RadioTower, Waves, Cable,
  Cpu, MemoryStick, Thermometer, Wifi as WifiIcon
} from 'lucide-vue-next'

const modem = useModemStore()
const hist = useHistoryStore()
const sys = ref(null)
const wan = ref(null)
const wanCfg = ref(null)
const leases = ref([])
const wifiStations = ref([])
const linkSpeed = ref('')
const ready = ref(false)

const st = computed(() => modem.status || {})
const sig = computed(() => st.value.signal || {})
const op = computed(() => st.value.operator || {})
const serving = computed(() => st.value.serving || {})
const carriers = computed(() => st.value.carriers || [])
const hasNr = computed(() => sig.value.nr_sinr != null)
const online = computed(() => !!(wan.value && wan.value.up))

const CELL_PROTOS = ['atc', 'qmi', 'mbim', 'ncm', '3g', 'modemmanager']
const isCellular = computed(() => {
  const p = wanCfg.value && wanCfg.value.proto
  if (p) return CELL_PROTOS.includes(p)
  return !!modem.online
})

// ---- live throughput ----
const wanDev = ref('')
const downRate = ref(0)
const upRate = ref(0)
let prev = { rx: 0, tx: 0, t: 0 }
async function pollThroughput() {
  if (!wanDev.value) {
    try { const w = await netApi.wanStatus(); wan.value = w; wanDev.value = w.device || 'eth1' } catch (_) { return }
  }
  try {
    const s = await dev.status(wanDev.value)
    if (s && s.speed) linkSpeed.value = s.speed
    const stx = s && s.statistics
    if (!stx) return
    const now = Date.now()
    if (prev.t) {
      const dt = (now - prev.t) / 1000
      if (dt > 0) {
        downRate.value = Math.max(0, (stx.rx_bytes - prev.rx) / dt)
        upRate.value = Math.max(0, (stx.tx_bytes - prev.tx) / dt)
        hist.pushThroughput(downRate.value, upRate.value)
      }
    }
    prev = { rx: stx.rx_bytes, tx: stx.tx_bytes, t: now }
  } catch (_) {}
}
async function pollLatency() {
  try { const r = await netApi.ping('1.1.1.1', 2); hist.pushLatency(r.rtt, r.loss) } catch (_) {}
}
async function pollSlow() {
  await modem.refresh()
  try { sys.value = await sysApi.info(); updateCpu() } catch (_) {}
  try { wan.value = await netApi.wanStatus() } catch (_) {}
  try { wanCfg.value = await netApi.wanGet() } catch (_) {}
}
async function pollClients() {
  try { const l = await luci.dhcpLeases(); leases.value = (l && (l.dhcp_leases || l.leases)) || [] } catch (_) {}
  try { const c = await wifi.clients(); wifiStations.value = c.clients || [] } catch (_) {}
}
watch(() => modem.status, (s) => { if (isCellular.value) hist.pushSignal(s && s.signal) })

usePolling(pollThroughput, 2000)
usePolling(pollSlow, 5000)
usePolling(pollLatency, 3000)
usePolling(pollClients, 10000)
onMounted(async () => { await pollSlow(); ready.value = true; pollClients() })

// ---- charts ----
const thrSeries = computed(() => [
  { data: hist.down.map((b) => +(b * 8 / 1e6).toFixed(2)), color: 'var(--accent)', fill: true }
])
const rsrpSeries = computed(() => {
  const s = [{ data: hist.rsrp, color: 'var(--accent)', fill: true }]
  if (hist.nrRsrp.length) s.push({ data: hist.nrRsrp, color: 'var(--q-ex)', fill: false })
  return s
})
const sinrSeries = computed(() => {
  const s = [{ data: hist.sinr, color: 'var(--accent)', fill: true }]
  if (hist.nrSinr.length) s.push({ data: hist.nrSinr, color: 'var(--q-ex)', fill: false })
  return s
})

// ---- carrier aggregation (split 4G/5G) ----
function parseCarrier(c) {
  const s = String(c.band || '')
  const band = s.split(' ')[0] || s
  const fm = s.match(/\(([^)]+)\)/)
  const bm = s.match(/@\s*([\d.]+)\s*MHz/)
  return { role: c.role, band, freq: fm ? fm[1] : '', bw: bm ? bm[1] + ' MHz' : '', bwNum: bm ? parseFloat(bm[1]) : 0, pci: c.pci, earfcn: c.earfcn, is5g: /^n/i.test(band) }
}
const ccAll = computed(() => carriers.value.map(parseCarrier))
const lteCC = computed(() => ccAll.value.filter((c) => !c.is5g))
const nrCC = computed(() => ccAll.value.filter((c) => c.is5g))
const lteBw = computed(() => Math.round(lteCC.value.reduce((a, c) => a + c.bwNum, 0)))
const nrBw = computed(() => Math.round(nrCC.value.reduce((a, c) => a + c.bwNum, 0)))

// ---- clients ----
const stByMac = computed(() => { const m = {}; for (const s of wifiStations.value) m[String(s.mac || '').toUpperCase()] = s; return m })
const ifBand = (ifn) => (/^rax/.test(ifn) ? '5 GHz' : /^ra/.test(ifn) ? '2.4 GHz' : '')
const mergedClients = computed(() => leases.value.slice(0, 6).map((l) => {
  const mac = String(l.macaddr || l.mac || '').toUpperCase()
  const s = stByMac.value[mac]
  return { name: l.hostname || '—', ip: l.ipaddr || l.ip, mac, wifi: !!s, signal: s && s.signal, band: s ? ifBand(s.ifname) : '', pct: s && s.signal != null ? Math.max(0, Math.min(100, Math.round((s.signal + 90) / 55 * 100))) : 0 }
}))
const wifiCount = computed(() => wifiStations.value.length)

// ---- device tiles ----
// htop-style CPU%: busy = 1 - idleΔ/totalΔ across all cores, sampled between polls
const cpuPct = ref(0)
let prevCpu = null
function updateCpu() {
  const c = sys.value
  if (!c || c.cpu_total == null) return
  if (prevCpu) {
    const dt = c.cpu_total - prevCpu.total
    const di = c.cpu_idle - prevCpu.idle
    if (dt > 0) cpuPct.value = Math.max(0, Math.min(100, Math.round((1 - di / dt) * 100)))
  }
  prevCpu = { total: c.cpu_total, idle: c.cpu_idle }
}
const memPct = computed(() => { const m = sys.value && sys.value.memory; if (!m || !m.total) return 0; return Math.round((1 - (m.available != null ? m.available : m.free) / m.total) * 100) })
const cpuTemp = computed(() => (sys.value && sys.value.cpu_temp != null ? sys.value.cpu_temp : null))
const tempPct = computed(() => (cpuTemp.value != null ? Math.min(100, Math.round(cpuTemp.value / 95 * 100)) : 0))
const dash = (p) => `${Math.max(0, Math.min(100, p)) / 100 * 113} 113`
const heat = (p) => (p < 60 ? 'var(--q-ex)' : p < 85 ? 'var(--q-good)' : 'var(--q-poor)')

const uplinkTitle = computed(() => (isCellular.value ? (op.value.name || 'Cellulare') : 'WAN cablata'))
const uplinkSub = computed(() => (isCellular.value ? (st.value.tech || '5G') + (st.value.registration === 'roaming' ? ' · roaming' : '') : 'Ethernet · ' + ((wanCfg.value && wanCfg.value.proto) || 'dhcp').toUpperCase()))
const linkLabel = computed(() => { const s = String(linkSpeed.value || ''); const m = s.match(/(\d+)/); if (!m) return 'Ethernet'; const n = +m[1]; return n >= 1000 ? (n / 1000) + ' Gbps' : n + ' Mbps' })
</script>

<template>
  <!-- SKELETON while first data loads -->
  <div v-if="!ready" class="space-y-4">
    <div class="lk-card p-5">
      <div class="flex items-center gap-3">
        <Skeleton class="w-11 h-11 !rounded-[10px]" />
        <div class="space-y-2"><Skeleton class="h-4 w-32" /><Skeleton class="h-3 w-24" /></div>
        <div class="ml-auto hidden sm:flex gap-7"><Skeleton class="h-9 w-20" /><Skeleton class="h-9 w-20" /><Skeleton class="h-9 w-14" /></div>
      </div>
      <Skeleton class="h-12 w-full mt-5" />
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div v-for="i in 4" :key="i" class="lk-card p-4 flex items-center gap-3.5">
        <Skeleton class="w-11 h-11 !rounded-[10px]" /><div class="space-y-2"><Skeleton class="h-3 w-16" /><Skeleton class="h-5 w-12" /></div>
      </div>
    </div>
    <div class="lk-card p-5">
      <Skeleton class="h-4 w-36 mb-4" />
      <div class="grid sm:grid-cols-2 gap-5"><Skeleton class="h-24 w-full" /><Skeleton class="h-24 w-full" /></div>
    </div>
    <div class="grid gap-4 xl:grid-cols-12">
      <div class="lk-card p-5 xl:col-span-7 space-y-3"><Skeleton class="h-4 w-40" /><Skeleton class="h-40 w-full" /></div>
      <div class="lk-card p-5 xl:col-span-5 space-y-3"><Skeleton class="h-4 w-28 mb-1" /><Skeleton v-for="i in 4" :key="i" class="h-9 w-full" /></div>
    </div>
  </div>

  <div v-else class="space-y-4">
    <!-- INTERNET PANEL (adaptive) -->
    <div class="lk-card overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div class="flex items-center gap-2 text-sm font-semibold text-fg"><Globe class="w-4 h-4 text-accent" />{{ $t('dash.internet') }}</div>
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
          :style="{ background: online ? 'color-mix(in srgb,var(--q-ex) 14%,transparent)' : 'color-mix(in srgb,var(--q-poor) 14%,transparent)', color: online ? 'var(--q-ex)' : 'var(--q-poor)' }">
          <span class="w-1.5 h-1.5 rounded-full" :style="{ background: 'currentColor' }"></span>{{ online ? $t('common.online') : $t('common.offline') }}
        </span>
      </div>

      <div class="flex flex-col lg:flex-row lg:items-center p-5 gap-4 lg:gap-0">
        <!-- identity + signal: side by side at every width -->
        <div class="flex items-center gap-3 sm:gap-4 min-w-0">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-[10px] grid place-items-center shrink-0" style="background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)">
              <component :is="isCellular ? RadioTower : Cable" class="w-5 h-5" />
            </div>
            <div class="min-w-0">
              <div class="text-[15px] font-semibold text-fg truncate">{{ uplinkTitle }}</div>
              <div class="text-xs text-fg2 mt-0.5 truncate">{{ uplinkSub }}</div>
              <div class="font-mono text-xs text-fg2/80 mt-1 truncate">{{ (wan && wan.ipv4 && wan.ipv4[0]) || '—' }}</div>
            </div>
          </div>

          <div class="w-px self-stretch bg-border mx-1 sm:mx-3"></div>

          <!-- signal (cellular) | link (wan) -->
          <div v-if="isCellular" class="shrink-0">
            <div class="text-xs text-fg2">{{ $t('dash.signal') }}</div>
            <div class="flex items-center gap-2.5 mt-1.5">
              <SignalBars :percent="sig.percent" />
              <span class="text-[22px] font-bold text-fg leading-none">{{ sig.percent != null ? sig.percent + '%' : '—' }}</span>
            </div>
            <div class="font-mono text-xs text-fg2/80 mt-1.5">RSRP {{ sig.rsrp != null ? sig.rsrp : '—' }} · SINR {{ (hasNr ? sig.nr_sinr : sig.sinr) ?? '—' }}</div>
          </div>
          <div v-else class="shrink-0">
            <div class="text-xs text-fg2">Link</div>
            <div class="text-[22px] font-bold leading-none mt-1.5" style="color:var(--q-ex)">{{ linkLabel }}</div>
            <div class="font-mono text-xs text-fg2/80 mt-1.5">GW {{ (wan && wan.gateway) || '—' }}</div>
          </div>
        </div>

        <div class="w-px self-stretch bg-border mx-5 hidden lg:block"></div>

        <!-- speeds -->
        <div class="flex justify-between lg:justify-end gap-4 lg:gap-7 lg:ml-auto lg:text-right border-t border-border pt-4 lg:pt-0 lg:border-0">
          <div><div class="text-xs text-fg2">{{ $t('dash.download_speed') }}</div><div class="text-[22px] font-bold leading-none mt-1.5" style="color:var(--accent)">{{ fmtRate(downRate) }}</div></div>
          <div><div class="text-xs text-fg2">{{ $t('dash.upload_speed') }}</div><div class="text-[22px] font-bold leading-none mt-1.5 text-fg">{{ fmtRate(upRate) }}</div></div>
          <div><div class="text-xs text-fg2">{{ $t('dash.latency') }}</div><div class="text-[22px] font-bold leading-none mt-1.5 text-fg">{{ hist.rttLast != null ? Math.round(hist.rttLast) : '—' }}<span class="text-xs text-fg2 font-medium"> ms</span></div></div>
        </div>
      </div>

      <div class="px-5 pb-3"><LineChart :series="thrSeries" :height="50" :min="0" :grid="0" :axis="false" /></div>
    </div>

    <!-- DEVICE TILES -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="lk-card p-4 flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-[10px] grid place-items-center shrink-0" style="background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)"><Users class="w-5 h-5" /></div>
        <div><div class="text-xs text-fg2">{{ $t('dash.clients_online') }}</div><div class="text-xl font-bold text-fg">{{ leases.length }}</div></div>
      </div>
      <div class="lk-card p-4 flex items-center gap-3.5">
        <svg viewBox="0 0 44 44" width="40" height="40" class="shrink-0"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--muted)" stroke-width="4" /><circle cx="22" cy="22" r="18" fill="none" :stroke="heat(cpuPct)" stroke-width="4" stroke-linecap="round" :stroke-dasharray="dash(cpuPct)" transform="rotate(-90 22 22)" /></svg>
        <div><div class="text-xs text-fg2">{{ $t('dash.cpu_load') }}</div><div class="text-xl font-bold text-fg">{{ cpuPct }}<span class="text-xs text-fg2">%</span></div></div>
      </div>
      <div class="lk-card p-4 flex items-center gap-3.5">
        <svg viewBox="0 0 44 44" width="40" height="40" class="shrink-0"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--muted)" stroke-width="4" /><circle cx="22" cy="22" r="18" fill="none" :stroke="heat(memPct)" stroke-width="4" stroke-linecap="round" :stroke-dasharray="dash(memPct)" transform="rotate(-90 22 22)" /></svg>
        <div><div class="text-xs text-fg2">{{ $t('dash.memory') }}</div><div class="text-xl font-bold text-fg">{{ memPct }}<span class="text-xs text-fg2">%</span></div></div>
      </div>
      <div class="lk-card p-4 flex items-center gap-3.5">
        <svg viewBox="0 0 44 44" width="40" height="40" class="shrink-0"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--muted)" stroke-width="4" /><circle cx="22" cy="22" r="18" fill="none" :stroke="heat(tempPct)" stroke-width="4" stroke-linecap="round" :stroke-dasharray="dash(tempPct)" transform="rotate(-90 22 22)" /></svg>
        <div><div class="text-xs text-fg2">{{ $t('dash.cpu_temp') }}</div><div class="text-xl font-bold text-fg">{{ cpuTemp != null ? cpuTemp + '°' : '—' }}</div></div>
      </div>
    </div>

    <!-- SIGNAL HISTORY (cellular only) -->
    <div v-if="isCellular" class="lk-card p-5">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2 text-sm font-semibold text-fg"><Waves class="w-4 h-4 text-accent" />{{ $t('dash.signal_history') }}</div>
        <div class="flex items-center gap-3 text-[11px] text-fg2">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-accent"></span>4G</span>
          <span v-if="hist.nrRsrp.length" class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-q-ex"></span>5G</span>
        </div>
      </div>
      <div class="grid sm:grid-cols-2 gap-5">
        <div><div class="text-xs text-fg2 mb-1">RSRP (dBm)</div><LineChart :series="rsrpSeries" :height="92" :min="-120" :max="-60" :grid="3" /></div>
        <div><div class="text-xs text-fg2 mb-1">SINR (dB)</div><LineChart :series="sinrSeries" :height="92" :min="-5" :max="30" :grid="3" /></div>
      </div>
    </div>

    <!-- LOWER GRID: carrier + clients fill width on large screens -->
    <div class="grid gap-4 xl:grid-cols-12">
    <!-- CARRIER AGGREGATION — table, split 4G / 5G -->
    <div v-if="isCellular && ccAll.length" class="lk-card p-5 xl:col-span-7">
      <div class="flex items-center gap-2 text-sm font-semibold text-fg mb-4"><RadioTower class="w-4 h-4 text-accent" />{{ $t('modem.carrier_aggregation') }}</div>

      <div v-if="lteCC.length">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-accent"></span><span class="text-xs font-semibold text-fg">4G LTE</span><span class="text-[11px] text-fg2">{{ lteCC.length }} CC · {{ lteBw }} MHz</span></div>
          <span class="text-[11px] text-fg2">RSRP {{ sig.rsrp }} · SINR {{ sig.sinr }}</span>
        </div>
        <table class="w-full text-sm">
          <thead><tr class="text-left text-[10px] uppercase tracking-wider text-fg3 font-semibold">
            <th class="py-1.5 font-semibold">CC</th><th class="font-semibold">Banda</th>
            <th class="font-semibold text-right">BW</th><th class="font-semibold text-right">PCI</th><th class="font-semibold text-right">EARFCN</th>
          </tr></thead>
          <tbody>
            <tr v-for="c in lteCC" :key="c.role" class="border-t border-border">
              <td class="py-2"><span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" :class="c.role === 'PCC' ? 'bg-accent text-white' : 'bg-muted text-fg2'">{{ c.role.replace('SCC', 'S') }}</span></td>
              <td><span class="font-semibold text-fg">{{ c.band }}</span> <span class="text-fg3 font-mono text-xs">{{ c.freq }}</span></td>
              <td class="text-right font-mono text-fg">{{ c.bwNum }}</td>
              <td class="text-right font-mono text-fg2">{{ c.pci }}</td>
              <td class="text-right font-mono text-fg2">{{ c.earfcn }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="nrCC.length" :class="lteCC.length ? 'mt-4' : ''">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-q-ex"></span><span class="text-xs font-semibold text-fg">5G NR</span><span class="text-[11px] text-fg2">{{ nrCC.length }} CC · {{ nrBw }} MHz</span></div>
          <span v-if="hasNr" class="text-[11px] text-fg2">RSRP {{ sig.nr_rsrp }} · SINR {{ sig.nr_sinr }}</span>
        </div>
        <table class="w-full text-sm">
          <thead><tr class="text-left text-[10px] uppercase tracking-wider text-fg3 font-semibold">
            <th class="py-1.5 font-semibold">CC</th><th class="font-semibold">Banda</th>
            <th class="font-semibold text-right">BW</th><th class="font-semibold text-right">PCI</th><th class="font-semibold text-right">EARFCN</th>
          </tr></thead>
          <tbody>
            <tr v-for="c in nrCC" :key="c.role" class="border-t border-border">
              <td class="py-2"><span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" style="background:color-mix(in srgb,var(--q-ex) 16%,transparent);color:var(--q-ex)">{{ c.role.replace('SCC', 'S') }}</span></td>
              <td><span class="font-semibold text-fg">{{ c.band }}</span> <span class="text-fg3 font-mono text-xs">{{ c.freq }}</span></td>
              <td class="text-right font-mono text-fg">{{ c.bwNum }}</td>
              <td class="text-right font-mono text-fg2">{{ c.pci }}</td>
              <td class="text-right font-mono text-fg2">{{ c.earfcn }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- CLIENTS -->
    <div class="lk-card p-5" :class="(isCellular && ccAll.length) ? 'xl:col-span-5' : 'xl:col-span-12'">
      <div class="flex items-center justify-between mb-3">
        <div class="text-sm font-semibold text-fg">{{ $t('dash.clients_online') }} <span class="text-fg2 font-normal">· {{ wifiCount }} Wi-Fi</span></div>
        <RouterLink :to="{ name: 'clients' }" class="text-sm text-accent inline-flex items-center gap-1">{{ $t('dash.view_all') }}<ArrowRight class="w-3.5 h-3.5" /></RouterLink>
      </div>
      <div class="space-y-2.5">
        <div v-for="c in mergedClients" :key="c.mac" class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2.5 min-w-0">
            <component :is="c.wifi ? WifiIcon : Cable" class="w-4 h-4 shrink-0" :class="c.wifi ? 'text-accent' : 'text-fg2'" />
            <div class="min-w-0"><div class="text-sm text-fg truncate leading-tight">{{ c.name }}</div><div class="text-[11px] font-mono text-fg2">{{ c.ip }}</div></div>
          </div>
          <div v-if="c.wifi" class="flex items-center gap-2 shrink-0"><span class="text-[10px] text-fg2">{{ c.band }}</span><SignalBars :percent="c.pct" /><span class="text-xs text-fg2 w-14 text-right">{{ c.signal }} dBm</span></div>
          <span v-else class="text-[10px] text-fg2 shrink-0 border border-border rounded px-1.5 py-0.5">LAN</span>
        </div>
        <div v-if="!mergedClients.length" class="text-sm text-fg2">{{ $t('dash.no_clients') }}</div>
      </div>
    </div>
    </div>
  </div>
</template>
