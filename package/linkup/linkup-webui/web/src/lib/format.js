export function fmtBytes(n) {
  if (n == null || n === '' || isNaN(n)) return '—'
  n = Number(n)
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i === 0 ? 0 : n < 10 ? 1 : 0)} ${u[i]}`
}

export function fmtDuration(sec) {
  sec = Number(sec) || 0
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const p = (x) => String(x).padStart(2, '0')
  return d > 0 ? `${d}d ${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}:${p(s)}`
}

export function fmtRate(bps) {
  if (bps == null || isNaN(bps) || bps < 0) return '0 B/s'
  const u = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let n = Number(bps), i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

export function fmtNum(v, digits = 0) {
  if (v == null || v === '' || isNaN(v)) return '—'
  return Number(v).toFixed(digits)
}

export function fmtMac(mac) {
  return String(mac || '').toUpperCase()
}

// vendor-ish short label from a hostname/mac fallback
export function clientName(lease, hints, mac) {
  return (lease && lease.hostname) || (hints && hints[mac] && hints[mac].name) || '—'
}
