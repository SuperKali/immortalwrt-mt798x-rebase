<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { sim } from '../api/linkup'
import { useUiStore } from '../stores/ui'
import { useSlowOp } from '../composables/useSlowOp'
import Card from '../components/Card.vue'
import PageHeader from '../components/PageHeader.vue'
import Spinner from '../components/Spinner.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { RefreshCw, Plus, Trash2, Send, X } from 'lucide-vue-next'

const { t } = useI18n()
const ui = useUiStore()
const messages = ref([])
const loading = ref(true)
const compose = ref(false)
const to = ref('')
const text = ref('')
const confirmDel = ref(null)
const { pending, run } = useSlowOp()

function mergeParts(list) {
  const byRef = {}
  const out = []
  for (const m of list) {
    if (m.total > 1 && m.reference != null) {
      if (!byRef[m.reference]) { byRef[m.reference] = { ...m, content: '', _p: [] }; out.push(byRef[m.reference]) }
      byRef[m.reference]._p[(m.part || 1) - 1] = m.content
    } else out.push(m)
  }
  for (const k in byRef) byRef[k].content = byRef[k]._p.join('')
  return out.sort((a, b) => (b.index || 0) - (a.index || 0))
}

async function load() {
  loading.value = true
  try { const r = await sim.smsList(); messages.value = mergeParts(r.messages || []) }
  catch (e) { ui.toast(e.message, 'error') } finally { loading.value = false }
}
onMounted(load)

async function send() {
  if (!to.value || !text.value) return
  await run(async () => {
    await sim.smsSend(to.value, text.value)
    ui.toast(t('sms.sent'), 'success')
    compose.value = false; to.value = ''; text.value = ''
    setTimeout(load, 1500)
  }).catch((e) => ui.toast(e.message, 'error'))
}
async function doDelete(idx) {
  confirmDel.value = null
  await run(async () => { await sim.smsDelete(idx); ui.toast(t('sms.deleted'), 'success'); load() })
    .catch((e) => ui.toast(e.message, 'error'))
}
</script>

<template>
  <div>
    <PageHeader :title="$t('sms.title')">
      <template #actions>
        <button class="lk-btn-ghost" @click="load"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /></button>
        <button class="lk-btn-ghost text-q-poor" v-if="messages.length" @click="confirmDel = 'all'"><Trash2 class="w-4 h-4" /></button>
        <button class="lk-btn-primary" @click="compose = true"><Plus class="w-4 h-4" />{{ $t('sms.new') }}</button>
      </template>
    </PageHeader>

    <div v-if="loading" class="lk-card p-10 grid place-items-center text-fg2"><Spinner /></div>
    <div v-else-if="!messages.length" class="lk-card p-10 text-center text-fg2 text-sm">{{ $t('sms.empty') }}</div>
    <div v-else class="space-y-2">
      <Card v-for="m in messages" :key="m.index">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-semibold text-fg">{{ m.sender || '—' }}</span>
              <span class="text-xs text-fg2">{{ m.timestamp }}</span>
            </div>
            <p class="text-sm text-fg whitespace-pre-wrap break-words">{{ m.content }}</p>
          </div>
          <button class="p-1.5 text-fg2 hover:text-q-poor shrink-0" @click="confirmDel = m.index"><Trash2 class="w-4 h-4" /></button>
        </div>
      </Card>
    </div>

    <!-- compose -->
    <transition name="fade">
      <div v-if="compose" class="fixed inset-0 z-50 grid place-items-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="compose = false"></div>
        <Card class="relative w-full max-w-md">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-fg">{{ $t('sms.new') }}</h3>
            <button class="p-1 text-fg2 hover:text-fg" @click="compose = false"><X class="w-5 h-5" /></button>
          </div>
          <form @submit.prevent="send" class="space-y-3">
            <div><label class="lk-label">{{ $t('sms.to') }}</label><input v-model="to" class="lk-input" placeholder="+39…" /></div>
            <div><label class="lk-label">{{ $t('sms.message') }}</label><textarea v-model="text" rows="4" class="lk-input resize-none"></textarea></div>
            <button class="lk-btn-primary w-full" :disabled="pending">
              <Spinner v-if="pending" /><template v-else><Send class="w-4 h-4" />{{ $t('common.send') }}</template>
            </button>
          </form>
        </Card>
      </div>
    </transition>

    <ConfirmDialog :open="confirmDel !== null" danger :title="$t('sms.title')"
      :message="confirmDel === 'all' ? $t('sms.delete_all') + '?' : '#' + confirmDel + ' ?'"
      @cancel="confirmDel = null" @confirm="doDelete(confirmDel)" />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .15s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
