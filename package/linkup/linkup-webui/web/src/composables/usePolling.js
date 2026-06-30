import { onMounted, onUnmounted } from 'vue'

// Poll fn() every intervalMs while the component is mounted and the tab is visible.
// Errors are swallowed (the caller's store keeps its last-good value).
export function usePolling(fn, intervalMs, { immediate = true } = {}) {
  let timer = null

  async function tick() {
    if (document.hidden) return
    try { await fn() } catch (_) {}
  }
  function start() {
    if (timer) return
    if (immediate) tick()
    timer = setInterval(tick, intervalMs)
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null }
  }
  function onVis() { if (!document.hidden) tick() }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVis)
    start()
  })
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVis)
    stop()
  })

  return { stop, start, tick }
}
