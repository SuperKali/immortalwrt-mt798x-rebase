<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { system as sysApi } from '../api/linkup'
import { Eye, EyeOff, ArrowRight } from 'lucide-vue-next'
import Spinner from '../components/Spinner.vue'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()

const password = ref('')
const show = ref(false)
const busy = ref(false)
const failed = ref(false)

async function submit() {
  busy.value = true
  failed.value = false
  try {
    await session.login('root', password.value)
    let needs = false
    try { const r = await sysApi.needsPassword(); needs = r && r.needs_password } catch (_) {}
    if (needs) { router.push({ name: 'first-run' }); return }
    router.push(route.query.redirect || { name: 'dashboard' })
  } catch (e) {
    failed.value = true
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="min-h-screen grid place-items-center p-4 bg-bg">
    <div class="w-full max-w-sm">
      <div class="flex flex-col items-center mb-8">
        <div class="w-14 h-14 rounded-2xl grid place-items-center text-white text-2xl font-bold mb-3"
          style="background:linear-gradient(135deg,#3b82f6,#6366f1)">L</div>
        <h1 class="text-xl font-semibold text-fg">{{ $t('brand') }}</h1>
        <p class="text-sm text-fg2">{{ $t('login.subtitle') }}</p>
      </div>
      <form class="lk-card p-6 space-y-4" @submit.prevent="submit">
        <div>
          <label class="lk-label">{{ $t('login.password') }}</label>
          <div class="relative">
            <input :type="show ? 'text' : 'password'" v-model="password" class="lk-input pr-10"
              autocomplete="current-password" autofocus />
            <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-fg2 p-1" @click="show = !show">
              <EyeOff v-if="show" class="w-4 h-4" /><Eye v-else class="w-4 h-4" />
            </button>
          </div>
          <p class="text-xs text-fg2 mt-1.5">{{ $t('login.blank_hint') }}</p>
        </div>
        <p v-if="failed" class="text-sm text-q-poor">{{ $t('login.failed') }}</p>
        <button class="lk-btn-primary w-full" :disabled="busy">
          <Spinner v-if="busy" />
          <template v-else>{{ $t('login.signin') }}<ArrowRight class="w-4 h-4" /></template>
        </button>
      </form>
    </div>
  </div>
</template>
