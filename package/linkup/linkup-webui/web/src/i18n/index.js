import { createI18n } from 'vue-i18n'
import en from './en.json'
import it from './it.json'

const saved = localStorage.getItem('linkup_locale') ||
  ((navigator.language || '').toLowerCase().startsWith('it') ? 'it' : 'en')

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: saved,
  fallbackLocale: 'en',
  messages: { en, it }
})
