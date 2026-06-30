<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { uci, netif } from '../api/linkup'
import { useUiStore } from '../stores/ui'
import { useSlowOp } from '../composables/useSlowOp'
import Card from '../components/Card.vue'
import PageHeader from '../components/PageHeader.vue'
import Spinner from '../components/Spinner.vue'
import { RefreshCw, AlertTriangle } from 'lucide-vue-next'

const { t } = useI18n()
const ui = useUiStore()
const lan = ref({})
const ifaces = ref([])
const loading = ref(true)
const { pending, run } = useSlowOp()

async function load() {
  loading.value = true
  try {
    const r = await uci.get('network', 'lan'); lan.value = (r && r.values) || r || {}
    const d = await netif.dump(); ifaces.value = (d && d.interface) || []
  } catch (e) { ui.toast(e.message, 'error') } finally { loading.value = false }
}
onMounted(load)

async function save() {
  await run(async () => {
    await uci.set('network', 'lan', { ipaddr: lan.value.ipaddr, netmask: lan.value.netmask })
    await uci.commit('network')
    ui.toast(t('common.success'), 'success')
  }).catch((e) => ui.toast(e.message, 'error'))
}
const ifaceIp = (i) => (i['ipv4-address'] && i['ipv4-address'][0] && i['ipv4-address'][0].address) || i.l3_device || ''
</script>

<template>
  <div>
    <PageHeader :title="$t('network.title')">
      <template #actions><button class="lk-btn-ghost" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button></template>
    </PageHeader>

    <div v-if="loading" class="lk-card p-10 grid place-items-center text-fg2"><Spinner /></div>
    <div v-else class="grid gap-4 lg:grid-cols-2">
      <Card :title="$t('network.lan')">
        <div class="space-y-3">
          <div><label class="lk-label">{{ $t('network.ip_address') }}</label><input v-model="lan.ipaddr" class="lk-input font-mono" /></div>
          <div><label class="lk-label">{{ $t('network.netmask') }}</label><input v-model="lan.netmask" class="lk-input font-mono" /></div>
          <div class="flex items-start gap-2 text-xs text-amber-600">
            <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" /><span>{{ $t('bands.apply_warn') }}</span>
          </div>
          <button class="lk-btn-primary" :disabled="pending" @click="save"><Spinner v-if="pending" /><template v-else>{{ $t('common.save') }}</template></button>
        </div>
      </Card>

      <Card :title="$t('network.interfaces')">
        <div class="space-y-2">
          <div v-for="i in ifaces" :key="i.interface" class="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
            <span class="font-medium text-fg">{{ i.interface }}</span>
            <div class="flex items-center gap-2">
              <span class="font-mono text-fg2 text-xs">{{ ifaceIp(i) }}</span>
              <span class="w-2 h-2 rounded-full" :style="{ background: i.up ? 'var(--q-ex)' : 'var(--q-none)' }"></span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
