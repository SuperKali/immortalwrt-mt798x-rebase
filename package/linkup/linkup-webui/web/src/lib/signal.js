// Signal metric scaling, quality thresholds and colors.
// Ported verbatim from luci-app-3ginfo-lite 3gdetail.js so the look matches.

export const QUALITY_COLORS = {
  excellent: '#10b981',
  good: '#f59e0b',
  weak: '#f97316',
  poor: '#ef4444',
  none: '#d1d5db'
}

// per metric: [min,max] for % scaling + thresholds (>= comparison)
const M = {
  csq:     { min: 0, max: 31, unit: '', ex: 24, good: 17, weak: 10 },
  percent: { min: 0, max: 100, unit: '%', ex: 80, good: 60, weak: 40 },
  rssi:    { min: -110, max: -50, unit: 'dBm', ex: -65, good: -75, weak: -85 },
  rsrp:    { min: -120, max: -70, unit: 'dBm', ex: -80, good: -90, weak: -100 },
  rsrq:    { min: -20, max: -3, unit: 'dB', ex: -10, good: -15, weak: -17 },
  sinr:    { min: -10, max: 30, unit: 'dB', ex: 20, good: 13, weak: 0 }
}
// NR (5G) variants reuse the LTE equivalents
M.nr_rsrp = M.rsrp
M.nr_rsrq = M.rsrq
M.nr_sinr = M.sinr

export const METRIC_LABELS = {
  csq: 'CSQ', percent: 'Signal', rssi: 'RSSI', rsrp: 'RSRP', rsrq: 'RSRQ', sinr: 'SINR',
  nr_rsrp: 'RSRP', nr_rsrq: 'RSRQ', nr_sinr: 'SINR'
}

export function metricPercent(metric, value) {
  const m = M[metric]
  if (!m || value == null || value === '' || isNaN(value)) return 0
  const p = ((Number(value) - m.min) / (m.max - m.min)) * 100
  return Math.max(0, Math.min(100, Math.round(p)))
}

export function metricQuality(metric, value) {
  const m = M[metric]
  if (!m || value == null || value === '' || isNaN(value)) return 'none'
  const v = Number(value)
  if (v >= m.ex) return 'excellent'
  if (v >= m.good) return 'good'
  if (v >= m.weak) return 'weak'
  return 'poor'
}

export function metricColor(metric, value) {
  return QUALITY_COLORS[metricQuality(metric, value)]
}

export function metricUnit(metric) {
  return (M[metric] && M[metric].unit) || ''
}

// 5-bar indicator from a 0..100 percent value
export function signalBars(percent) {
  const p = Number(percent) || 0
  if (p >= 80) return { bars: 5, label: 'excellent', color: QUALITY_COLORS.excellent }
  if (p >= 60) return { bars: 4, label: 'good', color: QUALITY_COLORS.good }
  if (p >= 40) return { bars: 3, label: 'fair', color: QUALITY_COLORS.weak }
  if (p >= 20) return { bars: 2, label: 'weak', color: QUALITY_COLORS.poor }
  return { bars: 1, label: 'very weak', color: QUALITY_COLORS.poor }
}
