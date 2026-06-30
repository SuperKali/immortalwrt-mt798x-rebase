import { ref } from 'vue'

// Wraps a serial/modem write that can take several seconds: tracks pending + error.
export function useSlowOp() {
  const pending = ref(false)
  const error = ref(null)

  async function run(fn) {
    pending.value = true
    error.value = null
    try {
      return await fn()
    } catch (e) {
      error.value = e.message || 'error'
      throw e
    } finally {
      pending.value = false
    }
  }

  return { pending, error, run }
}
