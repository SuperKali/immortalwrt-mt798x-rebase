<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { modem as modemApi } from '../api/linkup'
import { useUiStore } from '../stores/ui'
import { useSlowOp } from '../composables/useSlowOp'
import Card from '../components/Card.vue'
import PageHeader from '../components/PageHeader.vue'
import Spinner from '../components/Spinner.vue'
import { RefreshCw } from 'lucide-vue-next'

const { t } = useI18n()
const ui = useUiStore()
const data = ref(null)
const loading = ref(true)
const active = ref('lte')
const sel = ref({ lte: new Set(), nsa5g: new Set(), sa5g: new Set() })
const { pending, run } = useSlowOp()

const tabs = [
  { key: 'lte', label: 'bands.lte', prefix: 'B' },
  { key: 'nsa5g', label: 'bands.nsa', prefix: 'n' },
  { key: 'sa5g', label: 'bands.sa', prefix: 'n' }
]
const visibleTabs = computed(() => tabs.filter((tb) => data.value && data.value[tb.key] && (data.value[tb.key].supported || []).length))
const cur = computed(() => (data.value ? data.value[active.value] : null))
const curPrefix = computed(() => tabs.find((tb) => tb.key === active.value)?.prefix || 'B')

async function load() {
  loading.value = true
  try {
    const r = await modemApi.bandsGet()
    data.value = r
    for (const k of ['lte', 'nsa5g', 'sa5g']) sel.value[k] = new Set((r[k] && r[k].enabled) || [])
    if (!visibleTabs.value.find((tb) => tb.key === active.value) && visibleTabs.value.length) active.value = visibleTabs.value[0].key
  } catch (e) { ui.toast(e.message, 'error') } finally { loading.value = false }
}
onMounted(load)

function toggle(rat, band) { const s = sel.value[rat]; s.has(band) ? s.delete(band) : s.add(band); sel.value = { ...sel.value } }
const isOn = (rat, band) => sel.value[rat].has(band)
function selectAll(rat) { sel.value[rat] = new Set((data.value[rat].supported || []).map((b) => b.band)); sel.value = { ...sel.value } }
function selectNone(rat) { sel.value[rat] = new Set(); sel.value = { ...sel.value } }

async function apply(rat) {
  const bands = [...sel.value[rat]].sort((a, b) => a - b)
  await run(async () => { await modemApi.bandsSet(rat, bands); ui.toast(t('bands.applied'), 'success') })
}
</script>

<template>
  <div>
    <PageHeader :title="$t('bands.title')">
      <template #actions>
        <button class="lk-btn-ghost" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button>
      </template>
    </PageHeader>

    <div v-if="loading" class="lk-card p-10 grid place-items-center text-fg2"><Spinner /></div>

    <template v-else-if="data">
      <div class="flex gap-1 mb-4 bg-muted rounded-lg p-1 w-fit">
        <button v-for="tb in visibleTabs" :key="tb.key"
          class="px-3.5 py-1.5 rounded-md text-sm font-medium transition"
          :class="active === tb.key ? 'bg-card text-fg shadow-sm' : 'text-fg2 hover:text-fg'"
          @click="active = tb.key">{{ $t(tb.label) }}</button>
      </div>

      <Card v-if="cur">
        <div class="flex items-center justify-between mb-4">
          <span class="text-sm text-fg2"><b class="text-fg">{{ sel[active].size }}</b> {{ $t('bands.enabled') }}</span>
          <div class="flex gap-2">
            <button class="lk-btn-ghost !py-1 !px-2.5 text-xs" @click="selectAll(active)">{{ $t('bands.select_all') }}</button>
            <button class="lk-btn-ghost !py-1 !px-2.5 text-xs" @click="selectNone(active)">{{ $t('bands.select_none') }}</button>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          <button v-for="b in cur.supported" :key="b.band" type="button" @click="toggle(active, b.band)"
            class="flex flex-col items-start rounded-lg border px-3 py-2 text-left transition"
            :class="isOn(active, b.band) ? 'border-accent bg-accent-soft' : 'border-border bg-card hover:bg-muted'">
            <span class="font-semibold text-fg">{{ curPrefix }}{{ b.band }}</span>
            <span class="text-[11px] text-fg2 leading-tight">{{ b.txt }}</span>
          </button>
        </div>
        <div class="mt-5 flex items-center justify-between gap-3 flex-wrap border-t border-border pt-4">
          <p class="text-xs text-fg2 flex-1">{{ $t('bands.apply_warn') }}</p>
          <button class="lk-btn-primary" :disabled="pending" @click="apply(active)">
            <Spinner v-if="pending" /><template v-else>{{ $t('common.apply') }}</template>
          </button>
        </div>
      </Card>
    </template>
  </div>
</template>
