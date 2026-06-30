<script setup>
import { ref } from 'vue'
import { sim } from '../api/linkup'
import { useUiStore } from '../stores/ui'
import { useSlowOp } from '../composables/useSlowOp'
import Card from '../components/Card.vue'
import PageHeader from '../components/PageHeader.vue'
import Spinner from '../components/Spinner.vue'
import { Send } from 'lucide-vue-next'

const ui = useUiStore()
const code = ref('')
const resp = ref('')
const { pending, run } = useSlowOp()

async function send() {
  const c = code.value.trim()
  if (!c) return
  await run(async () => { const r = await sim.ussd(c); resp.value = (r && r.response) || '—' })
    .catch((e) => ui.toast(e.message, 'error'))
}
</script>

<template>
  <div>
    <PageHeader :title="$t('ussd.title')" />
    <Card class="max-w-lg">
      <form @submit.prevent="send" class="flex gap-2">
        <input v-model="code" class="lk-input font-mono" :placeholder="$t('ussd.placeholder')" />
        <button class="lk-btn-primary shrink-0" :disabled="pending">
          <Spinner v-if="pending" /><Send v-else class="w-4 h-4" />
        </button>
      </form>
      <div v-if="resp" class="mt-4">
        <div class="text-xs font-medium text-fg2 mb-1.5">{{ $t('ussd.response') }}</div>
        <pre class="bg-muted rounded-lg p-3 text-sm text-fg whitespace-pre-wrap break-words font-mono">{{ resp }}</pre>
      </div>
    </Card>
  </div>
</template>
