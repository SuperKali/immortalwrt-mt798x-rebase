<script setup>
import { ref, nextTick } from 'vue'
import { modem } from '../api/linkup'
import { useUiStore } from '../stores/ui'
import { useSlowOp } from '../composables/useSlowOp'
import Card from '../components/Card.vue'
import PageHeader from '../components/PageHeader.vue'
import Spinner from '../components/Spinner.vue'
import { AlertTriangle, CornerDownLeft } from 'lucide-vue-next'

const ui = useUiStore()
const cmd = ref('')
const history = ref([])
const termEl = ref(null)
const { pending, run } = useSlowOp()

async function runCmd() {
  const c = cmd.value.trim()
  if (!c) return
  await run(async () => {
    const r = await modem.at(c)
    history.value.push({ cmd: c, resp: (r && r.response) || '' })
    cmd.value = ''
    await nextTick()
    if (termEl.value) termEl.value.scrollTop = termEl.value.scrollHeight
  }).catch((e) => ui.toast(e.message, 'error'))
}
</script>

<template>
  <div>
    <PageHeader :title="$t('at.title')" />
    <div class="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 mb-4 text-sm">
      <AlertTriangle class="w-5 h-5 shrink-0 mt-0.5" />
      <span>{{ $t('at.warn') }}</span>
    </div>
    <Card>
      <div ref="termEl" class="bg-[#0e1116] text-[#e7eaee] rounded-lg p-3 h-72 overflow-y-auto font-mono text-xs leading-relaxed mb-3">
        <div v-if="!history.length" class="text-[#6b7280]">AT&gt; …</div>
        <div v-for="(h, i) in history" :key="i" class="mb-2">
          <div class="text-[#4f8cf7]">&gt; {{ h.cmd }}</div>
          <pre class="whitespace-pre-wrap break-words text-[#9aa3af]">{{ h.resp }}</pre>
        </div>
      </div>
      <form @submit.prevent="runCmd" class="flex gap-2">
        <input v-model="cmd" class="lk-input font-mono" :placeholder="$t('at.placeholder')" autocapitalize="characters" autocomplete="off" spellcheck="false" />
        <button class="lk-btn-primary shrink-0" :disabled="pending">
          <Spinner v-if="pending" /><template v-else>{{ $t('at.run') }}<CornerDownLeft class="w-4 h-4" /></template>
        </button>
      </form>
    </Card>
  </div>
</template>
