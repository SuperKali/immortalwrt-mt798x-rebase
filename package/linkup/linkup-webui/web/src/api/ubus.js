// Minimal ubus JSON-RPC client (same transport LuCI uses): POST /ubus,
// params [session, object, method, args]; result is [code, data].
import { ubusStatusText } from '../lib/ubusStatus'

const ENDPOINT = '/ubus'
const NULL_SID = '00000000000000000000000000000000'

let _id = 1
let _token = NULL_SID
let _onExpire = null // async callback registered by the session store

export function setToken(t) { _token = t || NULL_SID }
export function getToken() { return _token }
export function onSessionExpire(cb) { _onExpire = cb }

export class UbusError extends Error {
  constructor(code, message, ubus = false) {
    super(message)
    this.name = 'UbusError'
    this.code = code
    this.ubus = ubus
  }
}

async function postRpc(sid, object, method, args) {
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: _id++, method: 'call', params: [sid, object, method, args || {}] })
    })
  } catch (e) {
    throw new UbusError(-1, 'network error')
  }
  if (!res.ok) throw new UbusError(-1, `HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new UbusError(json.error.code, json.error.message || 'rpc error')
  return json.result // [code, data]
}

export async function login(username, password) {
  const result = await postRpc(NULL_SID, 'session', 'login', { username, password, timeout: 7200 })
  const [code, data] = result || []
  if (code !== 0 || !data || !data.ubus_rpc_session) {
    throw new UbusError(code == null ? 6 : code, 'invalid credentials')
  }
  return { token: data.ubus_rpc_session, timeout: data.timeout, acls: data.acls }
}

// High-level call: injects the current token, transparently re-auths once on expiry.
export async function call(object, method, args = {}, opts = {}) {
  const retry = opts.retry !== false
  let result
  try {
    result = await postRpc(_token, object, method, args)
  } catch (e) {
    if (e.code === -32002 && retry && _onExpire) {
      await _onExpire()
      return call(object, method, args, { retry: false })
    }
    throw e
  }
  const [code, data] = result || []
  if (code === 6 && retry && _onExpire) {
    await _onExpire()
    return call(object, method, args, { retry: false })
  }
  if (code !== 0) throw new UbusError(code, ubusStatusText(code), true)
  return data
}

export async function sessionAccess() {
  // cheap token validity probe
  try {
    const r = await postRpc(_token, 'session', 'access', { scope: 'access-group' })
    return Array.isArray(r) && r[0] === 0
  } catch (_) {
    return false
  }
}

export async function logout() {
  try { await call('session', 'destroy', {}, { retry: false }) } catch (_) {}
  setToken(NULL_SID)
}
