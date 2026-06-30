<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { system } from '../api/linkup'
import { useUiStore } from '../stores/ui'
import { useSlowOp } from '../composables/useSlowOp'
import Card from '../components/Card.vue'
import PageHeader from '../components/PageHeader.vue'
import Spinner from '../components/Spinner.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { fmtDuration } from '../lib/format'
import { RotateCcw, ExternalLink, ScrollText } from 'lucide-vue-next'

const { t } = useI18n()
const ui = useUiStore()
const info = ref(null)
const loading = ref(true)
const pw = ref('')
const pw2 = ref('')
const logs = ref('')
const showLogs = ref(false)
const confirmReboot = ref(false)
const { pending, run } = useSlowOp()

async function load() {
  try { info.value = await system.info() } catch (e) { ui.toast(e.message, 'error') } finally { loading.value = false }
}
onMounted(load)

const memPct = computed(() => {
  const m = info.value && info.value.memory
  if (!m || !m.total) return 0
  return Math.round((1 - (m.available != null ? m.available : m.free) / m.total) * 100)
})

async function savePw() {
  if (pw.value.length < 6) { ui.toast(t('firstrun.too_short'), 'error'); return }
  if (pw.value !== pw2.value) { ui.toast(t('firstrun.mismatch'), 'error'); return }
  await run(async () => { await system.setPassword(pw.value); ui.toast(t('common.success'), 'success'); pw.value = ''; pw2.value = '' })
    .catch((e) => ui.toast(e.message, 'error'))
}
async function loadLogs() {
  showLogs.value = true
  try { const r = await system.logs(300); logs.value = (r && r.log) || '' } catch (e) { ui.toast(e.message, 'error') }
}
async function doReboot() {
  confirmReboot.value = false
  try { await system.reboot(); ui.toast(t('common.reboot') + '…', 'info') } catch (e) { ui.toast(e.message, 'error') }
}
</script>

<template>
  <div>
    <PageHeader :title="$t('system.title')" />
    <div v-if="loading" class="lk-card p-10 grid place-items-center text-fg2"><Spinner /></div>
    <div v-else class="grid gap-4 lg:grid-cols-2">
      <Card :title="$t('system.general')">
        <dl class="space-y-2.5 text-sm">
          <div class="flex justify-between gap-2"><dt class="text-fg2">{{ $t('modem.model') }}</dt><dd class="text-fg text-right">{{ info && info.model }}</dd></div>
          <div class="flex justify-between gap-2"><dt class="text-fg2">{{ $t('system.hostname') }}</dt><dd class="text-fg">{{ info && info.hostname }}</dd></div>
          <div class="flex justify-between gap-2"><dt class="text-fg2">{{ $t('system.firmware') }}</dt><dd class="text-fg text-xs text-right">{{ info && info.release }}</dd></div>
          <div class="flex justify-between gap-2"><dt class="text-fg2">{{ $t('dash.uptime') }}</dt><dd class="text-fg">{{ info && fmtDuration(info.uptime) }}</dd></div>
          <div class="flex justify-between gap-2"><dt class="text-fg2">{{ $t('dash.memory') }}</dt><dd class="text-fg">{{ memPct }}%</dd></div>
        </dl>
      </Card>

      <Card :title="$t('system.password')">
        <div class="space-y-3">
          <div><label class="lk-label">{{ $t('firstrun.new_password') }}</label><input type="password" v-model="pw" class="lk-input" autocomplete="new-password" /></div>
          <div><label class="lk-label">{{ $t('firstrun.confirm_password') }}</label><input type="password" v-model="pw2" class="lk-input" autocomplete="new-password" /></div>
          <button class="lk-btn-primary" :disabled="pending || !pw" @click="savePw">
            <Spinner v-if="pending" /><template v-else>{{ $t('common.save') }}</template>
          </button>
        </div>
      </Card>

      <Card :title="$t('system.logs')" class="lg:col-span-2">
        <template #actions>
          <button class="lk-btn-ghost !py-1 !px-2.5 text-xs" @click="loadLogs"><ScrollText class="w-4 h-4" />{{ $t('common.refresh') }}</button>
        </template>
        <pre v-if="showLogs" class="bg-[#0e1116] text-[#9aa3af] rounded-lg p-3 h-64 overflow-auto font-mono text-[11px] leading-relaxed">{{ logs || '…' }}</pre>
        <p v-else class="text-sm text-fg2">—</p>
      </Card>

      <Card class="lg:col-span-2">
        <div class="flex flex-wrap items-center gap-3">
          <a href="/cgi-bin/luci/" class="lk-btn-ghost"><ExternalLink class="w-4 h-4" />{{ $t('system.advanced') }}</a>
          <button class="lk-btn-danger ml-auto" @click="confirmReboot = true"><RotateCcw class="w-4 h-4" />{{ $t('common.reboot') }}</button>
        </div>
      </Card>
    </div>

    <ConfirmDialog :open="confirmReboot" danger :title="$t('common.reboot')" :message="$t('system.reboot_confirm')"
      :confirm-label="$t('common.reboot')" @cancel="confirmReboot = false" @confirm="doReboot" />
  </div>
</template>
