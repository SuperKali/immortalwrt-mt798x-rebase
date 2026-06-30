<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { system as sysApi } from '../api/linkup'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import { ShieldCheck } from 'lucide-vue-next'
import Spinner from '../components/Spinner.vue'

const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()
const pw = ref('')
const pw2 = ref('')
const busy = ref(false)
const errKey = ref('')

async function finish() {
  errKey.value = ''
  if (pw.value.length < 6) { errKey.value = 'too_short'; return }
  if (pw.value !== pw2.value) { errKey.value = 'mismatch'; return }
  busy.value = true
  try {
    await sysApi.setPassword(pw.value)
    await session.login('root', pw.value)
    ui.toast(ui.locale === 'it' ? 'Password impostata' : 'Password set', 'success')
    router.push({ name: 'dashboard' })
  } catch (e) {
    ui.toast(e.message || 'error', 'error')
  } finally {
    busy.value = false
  }
}
function skip() { router.push({ name: 'dashboard' }) }
</script>

<template>
  <div class="min-h-screen grid place-items-center p-4 bg-bg">
    <div class="w-full max-w-md">
      <div class="flex flex-col items-center mb-6 text-center">
        <div class="w-14 h-14 rounded-2xl grid place-items-center text-white mb-3"
          style="background:linear-gradient(135deg,#3b82f6,#6366f1)">
          <ShieldCheck class="w-7 h-7" />
        </div>
        <h1 class="text-xl font-semibold text-fg">{{ $t('firstrun.title') }}</h1>
        <p class="text-sm text-fg2">{{ $t('firstrun.subtitle') }}</p>
      </div>
      <form class="lk-card p-6 space-y-4" @submit.prevent="finish">
        <div>
          <label class="lk-label">{{ $t('firstrun.new_password') }}</label>
          <input type="password" v-model="pw" class="lk-input" autocomplete="new-password" autofocus />
        </div>
        <div>
          <label class="lk-label">{{ $t('firstrun.confirm_password') }}</label>
          <input type="password" v-model="pw2" class="lk-input" autocomplete="new-password" />
        </div>
        <p v-if="errKey" class="text-sm text-q-poor">{{ $t('firstrun.' + errKey) }}</p>
        <div class="flex gap-2 pt-1">
          <button type="button" class="lk-btn-ghost flex-1" @click="skip">{{ $t('firstrun.skip') }}</button>
          <button class="lk-btn-primary flex-1" :disabled="busy">
            <Spinner v-if="busy" /><template v-else>{{ $t('firstrun.finish') }}</template>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
