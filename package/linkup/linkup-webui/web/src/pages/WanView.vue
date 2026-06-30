<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { net } from '../api/linkup'
import { useUiStore } from '../stores/ui'
import { useSlowOp } from '../composables/useSlowOp'
import Card from '../components/Card.vue'
import PageHeader from '../components/PageHeader.vue'
import Spinner from '../components/Spinner.vue'
import FieldRow from '../components/FieldRow.vue'
import { RefreshCw, RefreshCcwDot, ExternalLink, ChevronRight } from 'lucide-vue-next'

const { t } = useI18n()
const ui = useUiStore()
const status = ref(null)
const loading = ref(true)
const available = ref([])
const proto = ref('dhcp')
const opts = reactive({})
const advOpen = ref(false)
const { pending, run } = useSlowOp()

const CELLULAR = ['atc', '3g', 'quectel']
const PROTO_LABELS = {
  dhcp: 'DHCP — automatic', static: 'Static IP', pppoe: 'PPPoE',
  atc: 'Cellular · AT (FM350)', '3g': 'Cellular · 3G', quectel: 'Cellular · Quectel',
  dhcpv6: 'DHCPv6', '6in4': '6in4 tunnel', '6rd': '6rd', '6to4': '6to4',
  ppp: 'PPP', wireguard: 'WireGuard (VPN)'
}
const GROUPS = [
  { label: 'Wired', protos: ['dhcp', 'static', 'pppoe'] },
  { label: 'Cellular', protos: ['atc', '3g', 'quectel'] },
  { label: 'IPv6', protos: ['dhcpv6', '6in4', '6rd', '6to4'] },
  { label: 'Other', protos: ['ppp', 'wireguard'] }
]
const PDP = ['IP', 'IPV6', 'IPV4V6']
const AUTH = [['0', 'None'], ['1', 'PAP'], ['2', 'CHAP'], ['3', 'PAP/CHAP']]
// fields: { key, label, type?, options?, placeholder?, default?, adv?(advanced), show?(o=>bool) }
const SCHEMA = {
  dhcp: [
    { key: 'device', label: 'WAN device', placeholder: 'wan', adv: true },
    { key: 'hostname', label: 'Send hostname', adv: true },
    { key: 'metric', label: 'Metric', type: 'number', adv: true },
    { key: 'peerdns', label: 'Use peer DNS', type: 'bool', default: '1', adv: true }
  ],
  static: [
    { key: 'ipaddr', label: 'IP address', placeholder: '192.168.1.2' },
    { key: 'netmask', label: 'Netmask', placeholder: '255.255.255.0' },
    { key: 'gateway', label: 'Gateway', placeholder: '192.168.1.1' },
    { key: 'dns', label: 'DNS servers', placeholder: '1.1.1.1 8.8.8.8' },
    { key: 'device', label: 'WAN device', placeholder: 'wan', adv: true },
    { key: 'metric', label: 'Metric', type: 'number', adv: true }
  ],
  pppoe: [
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'device', label: 'WAN device', placeholder: 'wan', adv: true },
    { key: 'ac', label: 'Access concentrator', adv: true },
    { key: 'service', label: 'Service name', adv: true },
    { key: 'mtu', label: 'MTU', type: 'number', placeholder: '1492', adv: true },
    { key: 'metric', label: 'Metric', type: 'number', adv: true }
  ],
  atc: [
    { key: 'auto_apn', label: 'Automatic APN', type: 'bool', default: '0' },
    { key: 'apn', label: 'APN', show: (o) => o.auto_apn !== '1' },
    { key: 'pincode', label: 'SIM PIN' },
    { key: 'device', label: 'Modem device', placeholder: '/dev/ttyUSB3', adv: true },
    { key: 'pdp', label: 'PDP type', type: 'select', options: PDP, adv: true },
    { key: 'auth', label: 'Authentication', type: 'select', options: AUTH, adv: true },
    { key: 'username', label: 'Username', adv: true },
    { key: 'password', label: 'Password', type: 'password', adv: true },
    { key: 'custom_at', label: 'Custom AT command', type: 'textarea', adv: true }
  ],
  '3g': [
    { key: 'apn', label: 'APN' },
    { key: 'pincode', label: 'SIM PIN' },
    { key: 'device', label: 'Modem device', adv: true },
    { key: 'service', label: 'Service type', adv: true },
    { key: 'username', label: 'Username', adv: true },
    { key: 'password', label: 'Password', type: 'password', adv: true }
  ],
  quectel: [
    { key: 'apn', label: 'APN' },
    { key: 'pincode', label: 'SIM PIN' },
    { key: 'device', label: 'Modem device', adv: true },
    { key: 'pdptype', label: 'PDP type', type: 'select', options: PDP, adv: true },
    { key: 'auth', label: 'Authentication', type: 'select', options: [['none', 'None'], ['pap', 'PAP'], ['chap', 'CHAP']], adv: true },
    { key: 'username', label: 'Username', adv: true },
    { key: 'password', label: 'Password', type: 'password', adv: true }
  ],
  dhcpv6: [
    { key: 'reqaddress', label: 'Request address', type: 'select', options: ['try', 'force', 'none'], adv: true },
    { key: 'reqprefix', label: 'Request prefix', placeholder: 'auto', adv: true },
    { key: 'metric', label: 'Metric', type: 'number', adv: true }
  ]
}

const fields = computed(() => SCHEMA[proto.value] || null)
const visible = (f) => !f.show || f.show(opts)
const essential = computed(() => (fields.value || []).filter((f) => !f.adv && visible(f)))
const advanced = computed(() => (fields.value || []).filter((f) => f.adv && visible(f)))
const protoGroups = computed(() => GROUPS
  .map((g) => ({ label: g.label, protos: g.protos.filter((p) => available.value.includes(p)) }))
  .filter((g) => g.protos.length))
const boolVal = (k, def) => { const v = opts[k]; return v === '1' || v === 1 || (v == null && def === '1') }

async function load() {
  loading.value = true
  try {
    const c = await net.wanGet()
    proto.value = c.proto || 'dhcp'
    for (const k of Object.keys(opts)) delete opts[k]
    Object.assign(opts, c.options || {})
    delete opts.proto
    try { const h = await net.protoHandlers(); available.value = Object.keys(h || {}) } catch (_) { available.value = Object.keys(SCHEMA) }
    try { status.value = await net.wanStatus() } catch (_) {}
  } catch (e) { ui.toast(e.message, 'error') } finally { loading.value = false }
}
onMounted(load)

// auto-fix the device when switching between wired and cellular families
watch(proto, (np, op) => {
  if (np === op) return
  advOpen.value = false
  const wasCell = CELLULAR.includes(op), isCell = CELLULAR.includes(np)
  if (isCell && !wasCell && (!opts.device || !String(opts.device).startsWith('/dev/'))) opts.device = '/dev/ttyUSB3'
  if (!isCell && wasCell && (!opts.device || String(opts.device).startsWith('/dev/'))) opts.device = 'wan'
})

async function save() {
  await run(async () => {
    const options = {}
    if (fields.value) for (const f of fields.value) {
      options[f.key] = f.type === 'bool' ? (boolVal(f.key, f.default) ? '1' : '0') : (opts[f.key] == null ? '' : String(opts[f.key]))
    }
    await net.wanSet({ proto: proto.value, options })
    ui.toast(t('wan.saved'), 'success'); setTimeout(load, 3000)
  }).catch((e) => ui.toast(e.message, 'error'))
}
async function reconnect() {
  await run(async () => { await net.reconnect(); ui.toast(t('wan.saved'), 'info'); setTimeout(load, 4000) })
    .catch((e) => ui.toast(e.message, 'error'))
}
</script>

<template>
  <div>
    <PageHeader :title="$t('wan.title')">
      <template #actions>
        <button class="lk-btn-ghost" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button>
        <button class="lk-btn-ghost" :disabled="pending" @click="reconnect"><RefreshCcwDot class="w-4 h-4" />{{ $t('modem.reconnect') }}</button>
      </template>
    </PageHeader>

    <div v-if="loading" class="lk-card p-10 grid place-items-center text-fg2"><Spinner /></div>
    <div v-else class="grid gap-4 lg:grid-cols-3">
      <Card class="lg:col-span-2" :title="$t('wan.connection')">
        <div class="space-y-3">
          <!-- protocol selector -->
          <div>
            <label class="lk-label">{{ $t('wan.protocol') }}</label>
            <select v-model="proto" class="lk-input">
              <optgroup v-for="g in protoGroups" :key="g.label" :label="g.label">
                <option v-for="p in g.protos" :key="p" :value="p">{{ PROTO_LABELS[p] || p }}</option>
              </optgroup>
            </select>
          </div>

          <template v-if="fields">
            <!-- essential fields -->
            <FieldRow v-for="f in essential" :key="f.key" :field="f" v-model="opts[f.key]" />
            <p v-if="!essential.length" class="text-sm text-fg2 py-1">{{ $t('wan.auto_note') }}</p>

            <!-- advanced, collapsed by default (keep it simple) -->
            <div v-if="advanced.length" class="pt-1">
              <button type="button" class="flex items-center gap-1.5 text-xs font-medium text-fg2 hover:text-fg" @click="advOpen = !advOpen">
                <ChevronRight class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-90': advOpen }" />{{ $t('wan.advanced_settings') }}
              </button>
              <div v-show="advOpen" class="space-y-3 mt-3 pl-3 border-l-2 border-border">
                <FieldRow v-for="f in advanced" :key="f.key" :field="f" v-model="opts[f.key]" />
              </div>
            </div>

            <button class="lk-btn-primary" :disabled="pending" @click="save"><Spinner v-if="pending" /><template v-else>{{ $t('common.save') }}</template></button>
          </template>

          <!-- unsupported proto: defer to LuCI -->
          <div v-else class="rounded-lg border border-border p-4 text-sm text-fg2">
            <p class="mb-2">{{ $t('wan.advanced_proto') }}</p>
            <a href="/cgi-bin/luci/admin/network/network" class="inline-flex items-center gap-1.5 text-accent"><ExternalLink class="w-4 h-4" />{{ $t('nav.advanced') }}</a>
          </div>
        </div>
      </Card>

      <Card :title="$t('wan.status')">
        <dl class="space-y-2.5 text-sm">
          <div class="flex justify-between items-center"><dt class="text-fg2">{{ $t('wan.status') }}</dt>
            <dd><span class="lk-pill text-white" :style="{ background: status && status.up ? 'var(--q-ex)' : 'var(--q-poor)' }">
              {{ status && status.up ? $t('common.online') : $t('common.offline') }}</span></dd></div>
          <div class="flex justify-between gap-2"><dt class="text-fg2">{{ $t('wan.protocol') }}</dt><dd class="text-fg">{{ PROTO_LABELS[proto] || proto }}</dd></div>
          <div class="flex justify-between gap-2"><dt class="text-fg2">IPv4</dt><dd class="font-mono text-fg">{{ (status && status.ipv4 && status.ipv4[0]) || '—' }}</dd></div>
          <div class="flex justify-between gap-2"><dt class="text-fg2">IPv6</dt><dd class="font-mono text-fg text-xs break-all text-right">{{ (status && status.ipv6 && status.ipv6[0]) || '—' }}</dd></div>
          <div class="flex justify-between gap-2"><dt class="text-fg2">Gateway</dt><dd class="font-mono text-fg">{{ (status && status.gateway) || '—' }}</dd></div>
          <div class="flex justify-between gap-2"><dt class="text-fg2">DNS</dt><dd class="font-mono text-fg text-xs text-right break-all">{{ (status && status.dns && status.dns.join(', ')) || '—' }}</dd></div>
        </dl>
      </Card>
    </div>
  </div>
</template>
