import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as ubus from '../api/ubus'

export const useSessionStore = defineStore('session', () => {
  const token = ref(sessionStorage.getItem('linkup_sid') || '')
  const acls = ref(null)
  const username = ref('root')
  let _password = '' // in-memory only (never persisted) for transparent re-auth

  const isAuthed = computed(() => !!token.value)

  function _sync() {
    if (token.value) sessionStorage.setItem('linkup_sid', token.value)
    else sessionStorage.removeItem('linkup_sid')
    ubus.setToken(token.value)
  }

  async function login(user, pass) {
    const r = await ubus.login(user, pass)
    token.value = r.token
    acls.value = r.acls
    username.value = user
    _password = pass
    _sync()
    return r
  }

  async function reauth() {
    try {
      const r = await ubus.login(username.value, _password)
      token.value = r.token
      acls.value = r.acls
      _sync()
    } catch (e) {
      logout()
      throw e
    }
  }

  async function validate() {
    if (!token.value) return false
    ubus.setToken(token.value)
    const ok = await ubus.sessionAccess()
    if (!ok) { token.value = ''; _sync() }
    return ok
  }

  function logout() {
    ubus.logout()
    token.value = ''
    acls.value = null
    _password = ''
    _sync()
  }

  ubus.onSessionExpire(reauth)
  ubus.setToken(token.value)

  return { token, acls, username, isAuthed, login, reauth, validate, logout }
})
