<script setup>
import { computed, ref, onMounted } from 'vue'
import { useModemStore } from '../stores/modem'
import { modem as modemApi } from '../api/linkup'
import { usePolling } from '../composables/usePolling'
import { useUiStore } from '../stores/ui'
import { useSlowOp } from '../composables/useSlowOp'
import Card from '../components/Card.vue'
import SignalGauge from '../components/SignalGauge.vue'
import TechBadge from '../components/TechBadge.vue'
import Toggle from '../components/Toggle.vue'
import PageHeader from '../components/PageHeader.vue'
import { parseBand } from '../lib/bands'
import { RefreshCw, RadioTower } from 'lucide-vue-next'

const store = useModemStore()
const ui = useUiStore()
const st = computed(() => store.status || {})
const sig = computed(() => st.value.signal || {})
const serv = computed(() => st.value.serving || {})
const sim = computed(() => st.value.sim || {})
const carriers = computed(() => st.value.carriers || [])
const hasNr = computed(() => sig.value.nr_rsrp != null || String(st.value.tech || '').includes('5G'))

usePolling(() => store.refresh(), 5000)

const bodysar = ref(null)
const { pending: barPending, run: runBar } = useSlowOp()
async function loadBodysar() { try { const r = await modemApi.bodysarGet(); bodysar.value = r && r.enabled } catch (_) {} }
onMounted(loadBodysar)
async function toggleBodysar(v) {
  await runBar(async () => { await modemApi.bodysarSet(v); bodysar.value = v; ui.toast(v ? 'Body SAR on' : 'Body SAR off', 'success') })
}

function bandLabel(b) { const p = parseBand(b); return p ? p.name + (p.bw ? ` · ${p.bw}` : '') : '—' }
</script>

<template>
  <div>
    <PageHeader :title="$t('modem.title')" :subtitle="(st.operator && st.operator.location) || ''">
      <template #actions>
        <TechBadge :tech="st.tech" />
        <button class="lk-btn-ghost" @click="store.refresh()"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': store.loading }" /></button>
      </template>
    </PageHeader>

    <div class="space-y-5">
      <Card :title="$t('modem.signal_metrics')">
        <div class="text-xs font-semibold text-fg2 mb-2">{{ $t('modem.lte') }}</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <SignalGauge metric="rsrp" :value="sig.rsrp" />
          <SignalGauge metric="rsrq" :value="sig.rsrq" />
          <SignalGauge metric="sinr" :value="sig.sinr" />
          <SignalGauge metric="rssi" :value="sig.rssi" />
        </div>
        <template v-if="hasNr">
          <div class="text-xs font-semibold text-fg2 mb-2">{{ $t('modem.nr') }}</div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SignalGauge metric="nr_rsrp" :value="sig.nr_rsrp" />
            <SignalGauge metric="nr_rsrq" :value="sig.nr_rsrq" />
            <SignalGauge metric="nr_sinr" :value="sig.nr_sinr" />
          </div>
        </template>
      </Card>

      <div class="grid gap-4 md:grid-cols-2">
        <Card :title="$t('modem.carrier_aggregation')" :icon="RadioTower">
          <div class="space-y-2">
            <div v-for="c in carriers" :key="c.role" class="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="lk-pill bg-accent-soft text-accent shrink-0">{{ c.role }}</span>
                <span class="font-medium text-fg truncate">{{ bandLabel(c.band) }}</span>
              </div>
              <div class="text-xs text-fg2 shrink-0 ml-2">PCI {{ c.pci ?? '—' }} · {{ c.earfcn ?? '—' }}</div>
            </div>
            <div v-if="!carriers.length" class="text-sm text-fg2">—</div>
          </div>
        </Card>

        <Card :title="$t('modem.serving_cell')">
          <dl class="grid grid-cols-2 gap-y-2.5 text-sm">
            <dt class="text-fg2">{{ $t('modem.band') }}</dt><dd class="text-fg text-right">{{ serv.band || '—' }}</dd>
            <dt class="text-fg2">{{ $t('modem.pci') }}</dt><dd class="text-fg text-right">{{ serv.pci ?? '—' }}</dd>
            <dt class="text-fg2">{{ $t('modem.earfcn') }}</dt><dd class="text-fg text-right">{{ serv.earfcn ?? '—' }}</dd>
            <dt class="text-fg2">{{ $t('modem.tac') }}</dt><dd class="text-fg text-right font-mono">{{ (serv.tac && serv.tac.hex) || '—' }}</dd>
            <dt class="text-fg2">{{ $t('modem.cid') }}</dt><dd class="text-fg text-right font-mono">{{ (serv.cid && serv.cid.hex) || '—' }}</dd>
          </dl>
        </Card>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <Card :title="$t('modem.sim_info')">
          <dl class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-fg2">{{ $t('modem.imei') }}</dt><dd class="text-fg font-mono">{{ sim.imei || '—' }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-fg2">{{ $t('modem.imsi') }}</dt><dd class="text-fg font-mono">{{ sim.imsi || '—' }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-fg2">{{ $t('modem.iccid') }}</dt><dd class="text-fg font-mono text-xs break-all text-right">{{ sim.iccid || '—' }}</dd></div>
          </dl>
        </Card>

        <Card :title="$t('modem.modem_info')">
          <dl class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-fg2">{{ $t('modem.model') }}</dt><dd class="text-fg">{{ st.modem || '—' }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-fg2">{{ $t('modem.firmware') }}</dt><dd class="text-fg font-mono text-xs">{{ st.firmware || '—' }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-fg2">{{ $t('modem.protocol') }}</dt><dd class="text-fg uppercase">{{ st.protocol || '—' }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-fg2">{{ $t('modem.temperature') }}</dt><dd class="text-fg">{{ st.temperature_c != null ? Math.round(st.temperature_c) + '°C' : '—' }}</dd></div>
          </dl>
          <div class="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-border">
            <div class="min-w-0">
              <div class="text-sm font-medium text-fg">{{ $t('modem.bodysar') }}</div>
              <div class="text-xs text-fg2">{{ $t('modem.bodysar_hint') }}</div>
            </div>
            <Toggle :model-value="!!bodysar" :disabled="barPending || bodysar === null" @update:model-value="toggleBodysar" />
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
