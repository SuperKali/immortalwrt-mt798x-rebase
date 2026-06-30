<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { wifi, iwinfo } from '../api/linkup'
import { useUiStore } from '../stores/ui'
import { useSlowOp } from '../composables/useSlowOp'
import PageHeader from '../components/PageHeader.vue'
import Spinner from '../components/Spinner.vue'
import Toggle from '../components/Toggle.vue'
import SignalBars from '../components/SignalBars.vue'
import { RefreshCw, Eye, EyeOff, Wifi as WifiIcon, ChevronDown, KeyRound, Search, Lock, RadioTower, Plus, Trash2 } from 'lucide-vue-next'

const { t } = useI18n()
const ui = useUiStore()
const loading = ref(true)
const stations = ref([])
const radios = ref([])
const countryOpts = ref([])
const scanRes = ref({})
const scanning = ref({})
const { pending, run } = useSlowOp()

const encOptions = [
  ['none', t('common.none')], ['psk2', 'WPA2'], ['psk-mixed', 'WPA/WPA2'], ['sae', 'WPA3'], ['sae-mixed', 'WPA2/WPA3']
]
const htOptions = { '2g': ['HT20', 'HT40', 'HE20', 'HE40'], '5g': ['HE40', 'HE80', 'HE160', 'VHT80', 'VHT160'], '6g': ['HE80', 'HE160'] }
const txOptions = [['100', '100%'], ['75', '75%'], ['50', '50%'], ['25', '25%']]
const fallbackCh = {
  '2g': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  '5g': [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140],
  '6g': []
}
const bandName = (b) => ({ '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz' }[b] || b)
const tb = (v) => v === '1' || v === 1 || v === true

function toIface(i) {
  return {
    section: i.name, mode: i.mode === 'sta' ? 'sta' : 'ap',
    ssid: i.ssid || '', encryption: i.encryption || 'none', key: i.key || '',
    hidden: tb(i.hidden), isolate: tb(i.isolate), ieee80211k: tb(i.ieee80211k),
    mumimo: tb(i.mumimo_dl) || tb(i.mumimo_ul),
    macmode: i.macfilter || 'disable', macs: (i.maclist || []).join('\n'),
    ifname: i.ifname, enabled: !tb(i.disabled),
    showKey: false, open: false, advOpen: false, macOpen: false
  }
}

async function load() {
  loading.value = true
  try {
    const r = await wifi.get()
    radios.value = (r.radios || []).map((radio) => ({
      radioSection: radio.name, band: radio.band, phy: radio.phy,
      channel: radio.channel || 'auto', htmode: radio.htmode || '', txpower: radio.txpower || '100',
      country: radio.country || 'IT', bandsteering: tb(radio.bandsteering), mu_beamformer: tb(radio.mu_beamformer),
      enabled: !tb(radio.disabled), channels: fallbackCh[radio.band] || [], adv: false,
      ifaces: (r.ifaces || []).filter((i) => i.device === radio.name).map(toIface)
    }))
    await Promise.all(radios.value.map(async (radio) => {
      try {
        const fl = await iwinfo.freqlist(radio.phy || radio.radioSection)
        const ch = (fl.results || []).map((x) => x.channel).filter((v, i, a) => v && a.indexOf(v) === i).sort((a, b) => a - b)
        if (ch.length) radio.channels = ch
      } catch (_) {}
    }))
    if (radios.value[0]) {
      try { const cl = await iwinfo.countrylist(radios.value[0].phy || radios.value[0].radioSection); countryOpts.value = (cl.results || []).map((c) => c.code).filter(Boolean) } catch (_) {}
    }
    try { const c = await wifi.clients(); stations.value = c.clients || [] } catch (_) {}
  } catch (e) { ui.toast(e.message, 'error') } finally { loading.value = false }
}
onMounted(load)

async function scan(section, phy) {
  scanning.value = { ...scanning.value, [section]: true }
  try {
    const r = await iwinfo.scan(phy)
    scanRes.value = { ...scanRes.value, [section]: (r.results || []).filter((a) => a.ssid).sort((a, b) => b.signal - a.signal) }
  } catch (e) { ui.toast(e.message, 'error') } finally { scanning.value = { ...scanning.value, [section]: false } }
}
function pickAp(f, ap) {
  f.ssid = ap.ssid
  const d = (ap.encryption && ap.encryption.description) || ''
  if (/sae|wpa3/i.test(d)) f.encryption = 'sae-mixed'
  else if (/psk|wpa/i.test(d)) f.encryption = 'psk2'
  scanRes.value = { ...scanRes.value, [f.section]: null }
}

async function saveRadio(radio) {
  await run(async () => {
    await wifi.set(radio.radioSection, {
      channel: radio.channel, htmode: radio.htmode, txpower: radio.txpower, country: radio.country,
      bandsteering: radio.bandsteering ? '1' : '0', mu_beamformer: radio.mu_beamformer ? '1' : '0',
      disabled: radio.enabled ? '0' : '1'
    })
    for (const f of radio.ifaces) {
      if (f.mode === 'sta') {
        await wifi.clientSet(f.section, f.ssid, f.encryption, f.key)
      } else {
        await wifi.set(f.section, {
          mode: 'ap', network: 'lan', ssid: f.ssid, encryption: f.encryption,
          hidden: f.hidden ? '1' : '0', isolate: f.isolate ? '1' : '0', ieee80211k: f.ieee80211k ? '1' : '0',
          mumimo_dl: f.mumimo ? '1' : '0', mumimo_ul: f.mumimo ? '1' : '0', disabled: f.enabled ? '0' : '1',
          key: f.encryption !== 'none' ? f.key : null
        })
      }
    }
    ui.toast(t('wifi.saved'), 'success'); setTimeout(load, 2500)
  }).catch((e) => ui.toast(e.message, 'error'))
}
async function addIface(radio) {
  await run(async () => { await wifi.ifaceAdd(radio.radioSection); await load() }).catch((e) => ui.toast(e.message, 'error'))
}
async function delIface(section) {
  if (!window.confirm(t('wifi.delete_network'))) return
  await run(async () => { await wifi.ifaceDelete(section); await load() }).catch((e) => ui.toast(e.message, 'error'))
}
async function saveMac(f) {
  const macs = (f.macs || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
  await run(async () => { await wifi.macfilterSet(f.section, f.macmode, macs); ui.toast(t('wifi.saved'), 'success') })
    .catch((e) => ui.toast(e.message, 'error'))
}
async function doWps(f) {
  if (!f.ifname) { ui.toast('—', 'error'); return }
  await run(async () => { await wifi.wps(f.ifname); ui.toast('WPS · ' + t('wifi.wps_hint'), 'info') }).catch((e) => ui.toast(e.message, 'error'))
}
const stationsFor = (f) => stations.value.filter((s) => s.ifname === f.ifname)
const pct = (dbm) => (dbm == null ? 0 : Math.max(0, Math.min(100, Math.round((dbm + 90) / 55 * 100))))
</script>

<template>
  <div>
    <PageHeader :title="$t('wifi.title')">
      <template #actions><button class="lk-btn-ghost" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button></template>
    </PageHeader>

    <div v-if="loading" class="lk-card p-10 grid place-items-center text-fg2"><Spinner /></div>
    <div v-else class="grid gap-4 lg:grid-cols-2">
      <div v-for="radio in radios" :key="radio.radioSection" class="lk-card overflow-hidden self-start">
        <!-- radio header -->
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-[10px] grid place-items-center shrink-0" style="background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)"><WifiIcon class="w-5 h-5" /></div>
            <div><div class="font-semibold text-fg leading-tight">{{ bandName(radio.band) }}</div><div class="text-[11px] text-fg2">{{ radio.country }} · {{ radio.phy }}</div></div>
          </div>
          <Toggle v-model="radio.enabled" />
        </div>

        <div class="p-5 space-y-4">
          <!-- radio hw settings -->
          <div>
            <div class="text-[10px] uppercase tracking-wider text-fg3 font-semibold mb-2">{{ $t('wifi.radio_hw') }}</div>
            <div class="grid grid-cols-3 gap-3">
              <div><label class="lk-label">{{ $t('wifi.channel') }}</label>
                <select v-model="radio.channel" class="lk-input">
                  <option value="auto">auto</option>
                  <option v-for="c in radio.channels" :key="c" :value="String(c)">{{ c }}</option>
                </select></div>
              <div><label class="lk-label">{{ $t('wifi.htmode') }}</label><select v-model="radio.htmode" class="lk-input"><option v-for="h in (htOptions[radio.band] || [])" :key="h">{{ h }}</option></select></div>
              <div><label class="lk-label">{{ $t('wifi.txpower') }}</label><select v-model="radio.txpower" class="lk-input"><option v-for="tp in txOptions" :key="tp[0]" :value="tp[0]">{{ tp[1] }}</option></select></div>
            </div>
            <div class="border-t border-border mt-3 pt-2.5">
              <button class="flex items-center gap-1.5 text-sm font-medium text-fg2 hover:text-fg" @click="radio.adv = !radio.adv">
                <ChevronDown class="w-4 h-4 transition-transform" :class="{ 'rotate-180': radio.adv }" />{{ $t('wifi.advanced') }}
              </button>
              <div v-if="radio.adv" class="mt-3 space-y-2.5">
                <div class="flex items-center justify-between gap-3"><span class="text-sm text-fg">{{ $t('wifi.country') }}</span><select v-model="radio.country" class="lk-input !w-28"><option v-for="c in countryOpts" :key="c">{{ c }}</option></select></div>
                <div class="flex items-center justify-between"><span class="text-sm text-fg">{{ $t('wifi.bandsteering') }}</span><Toggle v-model="radio.bandsteering" /></div>
                <div class="flex items-center justify-between"><span class="text-sm text-fg">{{ $t('wifi.mu_beamformer') }}</span><Toggle v-model="radio.mu_beamformer" /></div>
              </div>
            </div>
          </div>

          <!-- networks -->
          <div class="border-t border-border pt-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] uppercase tracking-wider text-fg3 font-semibold">{{ $t('wifi.networks') }} ({{ radio.ifaces.length }})</span>
              <button class="text-accent text-xs font-medium flex items-center gap-1" :disabled="pending" @click="addIface(radio)"><Plus class="w-3.5 h-3.5" />{{ $t('wifi.add_network') }}</button>
            </div>

            <div class="space-y-2">
              <div v-for="f in radio.ifaces" :key="f.section" class="border border-border rounded-lg overflow-hidden">
                <!-- iface header -->
                <div class="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/50" @click="f.open = !f.open">
                  <ChevronDown class="w-4 h-4 text-fg3 transition-transform shrink-0" :class="{ 'rotate-180': f.open }" />
                  <RadioTower v-if="f.mode === 'sta'" class="w-4 h-4 text-fg2 shrink-0" /><WifiIcon v-else class="w-4 h-4 text-fg2 shrink-0" />
                  <span class="text-sm font-medium text-fg truncate flex-1">{{ f.ssid || '—' }}</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0" :class="f.mode === 'sta' ? 'bg-accent-soft text-accent' : 'bg-muted text-fg2'">{{ f.mode === 'sta' ? 'CLIENT' : 'AP' }}</span>
                  <Toggle v-model="f.enabled" @click.stop />
                  <button class="text-fg3 hover:text-destructive p-1 shrink-0" @click.stop="delIface(f.section)"><Trash2 class="w-4 h-4" /></button>
                </div>

                <!-- iface body -->
                <div v-if="f.open" class="px-3 pb-3 pt-1 space-y-3 border-t border-border">
                  <!-- mode -->
                  <div class="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
                    <button @click="f.mode = 'ap'" :class="['flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition', f.mode === 'ap' ? 'bg-card text-accent shadow-card' : 'text-fg2']"><WifiIcon class="w-3.5 h-3.5" />{{ $t('wifi.mode_ap') }}</button>
                    <button @click="f.mode = 'sta'" :class="['flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition', f.mode === 'sta' ? 'bg-card text-accent shadow-card' : 'text-fg2']"><RadioTower class="w-3.5 h-3.5" />{{ $t('wifi.mode_client') }}</button>
                  </div>

                  <!-- CLIENT -->
                  <template v-if="f.mode === 'sta'">
                    <div class="text-[11px] rounded-md px-2.5 py-1.5" style="background:color-mix(in srgb,var(--warning) 12%,transparent);color:var(--warning)">{{ $t('wifi.uplink_note') }}</div>
                    <div>
                      <label class="lk-label flex items-center justify-between">{{ $t('wifi.target') }}
                        <button class="text-accent text-xs font-medium flex items-center gap-1" :disabled="scanning[f.section]" @click="scan(f.section, radio.phy)"><Search class="w-3.5 h-3.5" :class="{ 'animate-pulse': scanning[f.section] }" />{{ scanning[f.section] ? $t('wifi.scanning') : $t('wifi.scan') }}</button>
                      </label>
                      <input v-model="f.ssid" class="lk-input" placeholder="SSID" />
                    </div>
                    <div v-if="scanRes[f.section]" class="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                      <button v-for="ap in scanRes[f.section]" :key="ap.bssid || ap.ssid" class="w-full flex items-center justify-between px-3 py-2 hover:bg-muted text-left" @click="pickAp(f, ap)">
                        <span class="flex items-center gap-2 min-w-0"><Lock v-if="ap.encryption && ap.encryption.enabled !== false" class="w-3.5 h-3.5 text-fg3 shrink-0" /><span class="text-sm text-fg truncate">{{ ap.ssid }}</span></span>
                        <span class="flex items-center gap-2 shrink-0"><span class="text-[11px] text-fg3">ch {{ ap.channel }}</span><SignalBars :percent="pct(ap.signal)" /></span>
                      </button>
                      <div v-if="!scanRes[f.section].length" class="px-3 py-3 text-sm text-fg3 text-center">{{ $t('wifi.no_aps') }}</div>
                    </div>
                  </template>

                  <!-- AP -->
                  <template v-else>
                    <div><label class="lk-label">{{ $t('wifi.ssid') }}</label><input v-model="f.ssid" class="lk-input" /></div>
                    <div class="flex items-center justify-between"><span class="text-sm text-fg">{{ $t('wifi.hidden') }}</span><Toggle v-model="f.hidden" /></div>
                  </template>

                  <!-- shared: encryption + key -->
                  <div><label class="lk-label">{{ $t('wifi.encryption') }}</label>
                    <select v-model="f.encryption" class="lk-input"><option v-for="e in encOptions" :key="e[0]" :value="e[0]">{{ e[1] }}</option></select></div>
                  <div v-if="f.encryption !== 'none'">
                    <label class="lk-label">{{ $t('wifi.key') }}</label>
                    <div class="relative">
                      <input :type="f.showKey ? 'text' : 'password'" v-model="f.key" class="lk-input pr-10" />
                      <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-fg2 p-1" @click="f.showKey = !f.showKey"><EyeOff v-if="f.showKey" class="w-4 h-4" /><Eye v-else class="w-4 h-4" /></button>
                    </div>
                  </div>

                  <!-- AP advanced + mac + stations -->
                  <template v-if="f.mode === 'ap'">
                    <div class="border-t border-border pt-2.5">
                      <button class="flex items-center gap-1.5 text-xs font-medium text-fg2 hover:text-fg" @click="f.advOpen = !f.advOpen"><ChevronDown class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180': f.advOpen }" />{{ $t('wifi.advanced') }}</button>
                      <div v-if="f.advOpen" class="mt-2.5 space-y-2.5">
                        <div class="flex items-center justify-between"><span class="text-sm text-fg">{{ $t('wifi.mumimo') }}</span><Toggle v-model="f.mumimo" /></div>
                        <div class="flex items-center justify-between"><span class="text-sm text-fg">{{ $t('wifi.roaming') }}</span><Toggle v-model="f.ieee80211k" /></div>
                        <div class="flex items-center justify-between"><span class="text-sm text-fg">{{ $t('wifi.isolate') }}</span><Toggle v-model="f.isolate" /></div>
                      </div>
                    </div>
                    <div class="border-t border-border pt-2.5">
                      <button class="flex items-center gap-1.5 text-xs font-medium text-fg2 hover:text-fg" @click="f.macOpen = !f.macOpen"><ChevronDown class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180': f.macOpen }" />{{ $t('wifi.macfilter') }}<span v-if="f.macmode !== 'disable'" class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-accent">{{ f.macmode }}</span></button>
                      <div v-if="f.macOpen" class="mt-2.5 space-y-2.5">
                        <select v-model="f.macmode" class="lk-input"><option value="disable">{{ $t('wifi.mac_off') }}</option><option value="allow">{{ $t('wifi.mac_allow') }}</option><option value="deny">{{ $t('wifi.mac_deny') }}</option></select>
                        <textarea v-if="f.macmode !== 'disable'" v-model="f.macs" rows="3" class="lk-input font-mono text-xs resize-none" :placeholder="$t('wifi.mac_hint')"></textarea>
                        <button class="lk-btn-ghost text-xs" :disabled="pending" @click="saveMac(f)">{{ $t('common.apply') }}</button>
                      </div>
                    </div>
                    <div v-if="stationsFor(f).length" class="border-t border-border pt-2.5">
                      <div class="text-xs font-medium text-fg2 mb-2">{{ $t('wifi.stations') }} ({{ stationsFor(f).length }})</div>
                      <div class="space-y-1.5">
                        <div v-for="s in stationsFor(f)" :key="s.mac" class="flex items-center justify-between text-xs"><span class="font-mono text-fg2">{{ s.mac }}</span><span class="flex items-center gap-2"><SignalBars :percent="pct(s.signal)" /><span class="text-fg2 w-14 text-right">{{ s.signal }} dBm</span></span></div>
                      </div>
                    </div>
                    <button class="lk-btn-ghost text-xs w-full justify-center" :disabled="pending" @click="doWps(f)"><KeyRound class="w-3.5 h-3.5" />{{ $t('wifi.wps') }}</button>
                  </template>
                </div>
              </div>

              <div v-if="!radio.ifaces.length" class="text-sm text-fg3 text-center py-3">—</div>
            </div>
          </div>

          <button class="lk-btn-primary w-full" :disabled="pending" @click="saveRadio(radio)"><Spinner v-if="pending" /><template v-else>{{ $t('common.save') }}</template></button>
        </div>
      </div>
    </div>
  </div>
</template>
