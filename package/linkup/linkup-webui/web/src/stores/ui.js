import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18n } from '../i18n'

let _toastId = 1

export const useUiStore = defineStore('ui', () => {
  const theme = ref(localStorage.getItem('linkup_theme') || 'light')
  const locale = ref(i18n.global.locale.value)
  const sidebarOpen = ref(false)
  const toasts = ref([])

  function applyTheme() {
    const dark = theme.value === 'dark' ||
      (theme.value === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }
  function initTheme() {
    applyTheme()
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme.value === 'auto') applyTheme()
    })
  }
  function setTheme(t) { theme.value = t; localStorage.setItem('linkup_theme', t); applyTheme() }
  function toggleTheme() {
    setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')
  }
  function setLocale(l) {
    locale.value = l
    i18n.global.locale.value = l
    localStorage.setItem('linkup_locale', l)
  }

  function toast(message, type = 'info', timeout = 3500) {
    const id = _toastId++
    toasts.value.push({ id, message, type })
    if (timeout) setTimeout(() => dismiss(id), timeout)
    return id
  }
  function dismiss(id) { toasts.value = toasts.value.filter((t) => t.id !== id) }

  return { theme, locale, sidebarOpen, toasts, initTheme, setTheme, toggleTheme, setLocale, toast, dismiss }
})
