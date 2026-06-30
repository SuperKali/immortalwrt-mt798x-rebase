<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { sim } from '../api/linkup'
import { useUiStore } from '../stores/ui'
import { useSlowOp } from '../composables/useSlowOp'
import Card from '../components/Card.vue'
import PageHeader from '../components/PageHeader.vue'
import Spinner from '../components/Spinner.vue'
import { RefreshCw, Download, Trash2, CheckCircle2 } from 'lucide-vue-next'

const { t } = useI18n()
const ui = useUiStore()
const chip = ref(null)
const profiles = ref([])
const available = ref(true)
const loading = ref(true)
const activation = ref('')
const { pending, run } = useSlowOp()

async function load() {
  loading.value = true
  try {
    const c = await sim.esimChip()
    if (!c || !c.ok) { available.value = false; return }
    available.value = true
    chip.value = c.data || {}
    try { const p = await sim.esimProfiles(); profiles.value = (p && p.profiles) || [] } catch (_) {}
  } catch (_) { available.value = false } finally { loading.value = false }
}
onMounted(load)

const eid = () => chip.value && (chip.value.eidValue || chip.value.EID || chip.value.eid)
async function download() {
  if (!activation.value) return
  await run(async () => { await sim.esimDownload({ activation: activation.value }); ui.toast(t('common.success'), 'success'); activation.value = ''; setTimeout(load, 2000) })
    .catch((e) => ui.toast(e.message, 'error'))
}
async function enable(iccid) { await run(async () => { await sim.esimEnable(iccid); ui.toast(t('common.success'), 'success'); load() }).catch((e) => ui.toast(e.message, 'error')) }
async function del(iccid) { await run(async () => { await sim.esimDelete(iccid); ui.toast(t('sms.deleted'), 'success'); load() }).catch((e) => ui.toast(e.message, 'error')) }
</script>

<template>
  <div>
    <PageHeader :title="$t('esim.title')">
      <template #actions><button class="lk-btn-ghost" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button></template>
    </PageHeader>

    <div v-if="loading" class="lk-card p-10 grid place-items-center text-fg2"><Spinner /></div>
    <div v-else-if="!available" class="lk-card p-10 text-center text-fg2 text-sm">{{ $t('esim.unavailable') }}</div>
    <div v-else class="space-y-4">
      <Card>
        <div class="flex justify-between gap-3"><span class="text-fg2 text-sm">{{ $t('esim.eid') }}</span>
          <span class="font-mono text-xs text-fg break-all text-right">{{ eid() || '—' }}</span></div>
      </Card>
      <Card :title="$t('esim.profiles')">
        <div v-if="!profiles.length" class="text-sm text-fg2">{{ $t('esim.no_profiles') }}</div>
        <div v-else class="space-y-2">
          <div v-for="p in profiles" :key="p.iccid" class="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
            <div class="min-w-0">
              <div class="font-medium text-fg truncate">{{ p.profileNickname || p.serviceProviderName || p.iccid }}</div>
              <div class="text-xs font-mono text-fg2">{{ p.iccid }}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span v-if="p.profileState === 'enabled'" class="lk-pill bg-accent-soft text-accent"><CheckCircle2 class="w-3.5 h-3.5" />on</span>
              <button v-else class="lk-btn-ghost !py-1 !px-2.5 text-xs" :disabled="pending" @click="enable(p.iccid)">{{ $t('common.enabled') }}</button>
              <button class="p-1.5 text-fg2 hover:text-q-poor" :disabled="pending" @click="del(p.iccid)"><Trash2 class="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </Card>
      <Card :title="$t('esim.download')">
        <form @submit.prevent="download" class="flex gap-2">
          <input v-model="activation" class="lk-input font-mono text-xs" :placeholder="$t('esim.activation_code')" />
          <button class="lk-btn-primary shrink-0" :disabled="pending"><Spinner v-if="pending" /><Download v-else class="w-4 h-4" /></button>
        </form>
      </Card>
    </div>
  </div>
</template>
