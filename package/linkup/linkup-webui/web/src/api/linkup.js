// Typed wrappers over the linkup.* ubus objects + the stock objects the SPA uses.
import { call } from './ubus'

export const modem = {
  status: () => call('linkup.modem', 'status'),
  bandsGet: () => call('linkup.modem', 'bands_get'),
  bandsSet: (rat, bands) => call('linkup.modem', 'bands_set', { rat, bands }),
  at: (command) => call('linkup.modem', 'at', { command }),
  reconnect: () => call('linkup.modem', 'reconnect'),
  bodysarGet: () => call('linkup.modem', 'bodysar_get'),
  bodysarSet: (enabled) => call('linkup.modem', 'bodysar_set', { enabled })
}

export const sim = {
  smsList: (storage = 'SM') => call('linkup.sim', 'sms_list', { storage }),
  smsCount: (storage = 'SM') => call('linkup.sim', 'sms_count', { storage }),
  smsSend: (number, text) => call('linkup.sim', 'sms_send', { number, text }),
  smsDelete: (index) => call('linkup.sim', 'sms_delete', { index }),
  ussd: (code) => call('linkup.sim', 'ussd_send', { code }),
  esimChip: () => call('linkup.sim', 'esim_chip'),
  esimProfiles: () => call('linkup.sim', 'esim_profiles'),
  esimEnable: (iccid) => call('linkup.sim', 'esim_enable', { iccid }),
  esimDisable: (iccid) => call('linkup.sim', 'esim_disable', { iccid }),
  esimDelete: (iccid) => call('linkup.sim', 'esim_delete', { iccid }),
  esimDownload: (payload) => call('linkup.sim', 'esim_download', payload),
  esimNotifications: () => call('linkup.sim', 'esim_notifications'),
  esimProcess: (seq = 'all') => call('linkup.sim', 'esim_process', { seq })
}

export const net = {
  wanGet: () => call('linkup.net', 'wan_get'),
  wanStatus: () => call('linkup.net', 'wan_status'),
  wanSet: (cfg) => call('linkup.net', 'wan_set', cfg),
  reconnect: () => call('linkup.net', 'reconnect'),
  apnSuggest: (mcc, mnc) => call('linkup.net', 'apn_suggest', { mcc, mnc }),
  ping: (host = '1.1.1.1', count = 2) => call('linkup.net', 'ping', { host, count }),
  hostTraffic: () => call('linkup.net', 'host_traffic'),
  lanLinks: () => call('linkup.net', 'lan_links'),
  protoHandlers: () => call('network', 'get_proto_handlers')
}

export const wifi = {
  get: () => call('linkup.wifi', 'get'),
  set: (section, options) => call('linkup.wifi', 'set', { section, options }),
  macfilterSet: (section, mode, macs) => call('linkup.wifi', 'macfilter_set', { section, mode, macs }),
  clientSet: (section, ssid, encryption, key) => call('linkup.wifi', 'client_set', { section, ssid, encryption, key }),
  ifaceAdd: (device) => call('linkup.wifi', 'iface_add', { device }),
  ifaceDelete: (section) => call('linkup.wifi', 'iface_delete', { section }),
  wps: (ifname) => call('linkup.wifi', 'wps', { ifname }),
  kick: (ifname, mac) => call('linkup.wifi', 'kick', { ifname, mac }),
  clients: (ifname) => call('linkup.wifi', 'clients', ifname ? { ifname } : {})
}

export const iwinfo = {
  freqlist: (device) => call('iwinfo', 'freqlist', { device }),
  countrylist: (device) => call('iwinfo', 'countrylist', { device }),
  scan: (device) => call('iwinfo', 'scan', { device })
}

export const system = {
  info: () => call('linkup.system', 'info'),
  needsPassword: () => call('linkup.system', 'needs_password'),
  setPassword: (password) => call('linkup.system', 'set_password', { password }),
  reboot: () => call('linkup.system', 'reboot'),
  firmwareValidate: (path) => call('linkup.system', 'firmware_validate', { path }),
  sysupgrade: (path, keep = true) => call('linkup.system', 'sysupgrade', { path, keep }),
  logs: (lines = 200) => call('linkup.system', 'logs', { lines })
}

// stock ubus objects
export const luci = {
  dhcpLeases: () => call('luci-rpc', 'getDHCPLeases', {}),
  hostHints: () => call('luci-rpc', 'getHostHints', {}),
  boardJSON: () => call('luci-rpc', 'getBoardJSON', {})
}

export const uci = {
  get: (config, section) => call('uci', 'get', section ? { config, section } : { config }),
  set: (config, section, values) => call('uci', 'set', { config, section, values }),
  commit: (config) => call('uci', 'commit', { config })
}

export const netif = {
  dump: () => call('network.interface', 'dump', {}),
  status: (name) => call(`network.interface`, 'status', { interface: name })
}

export const dev = {
  status: (name) => call('network.device', 'status', { name })
}
