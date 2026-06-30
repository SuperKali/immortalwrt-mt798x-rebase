import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { modem } from '../api/linkup'

export const useModemStore = defineStore('modem', () => {
  const status = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const lastOk = ref(0)

  const stale = computed(() => lastOk.value > 0 && Date.now() - lastOk.value > 12000)
  const online = computed(() => {
    const r = status.value && status.value.registration
    return r === '1' || r === '5' || r === '6' || r === '7'
  })

  async function refresh() {
    loading.value = true
    try {
      const s = await modem.status()
      if (s && s.ok) {
        status.value = s
        lastOk.value = Date.now()
        error.value = null
      } else {
        error.value = (s && s.error) || 'no data'
      }
    } catch (e) {
      error.value = e.message || 'error'
    } finally {
      loading.value = false
    }
  }

  return { status, loading, error, lastOk, stale, online, refresh }
})
