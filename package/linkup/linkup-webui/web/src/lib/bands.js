// Tech-badge classification + band-string parsing (ported from 3gdetail.js).

export function techClass(tech) {
  const t = String(tech || '').toLowerCase()
  if (t.includes('5g') && t.includes('nsa')) return '5gnsa'
  if (t.includes('5g') && t.includes('sa')) return '5gsa'
  if (t.includes('5g') || t.includes('nr')) return '5g'
  if (t.includes('lte') || t.includes('4g')) return 'lte'
  if (t.includes('3g') || t.includes('umts') || t.includes('hspa') || t.includes('wcdma')) return '3g'
  if (t.includes('2g') || t.includes('gsm') || t.includes('edge') || t.includes('gprs')) return '2g'
  return 'none'
}

export const TECH_GRADIENTS = {
  '5g':   ['#7c3aed', '#a855f7'],
  '5gnsa': ['#6d28d9', '#9333ea'],
  '5gsa': ['#7c3aed', '#c026d3'],
  lte:    ['#1c91f4', '#38bdf8'],
  '3g':   ['#0891b2', '#22d3ee'],
  '2g':   ['#64748b', '#94a3b8'],
  none:   ['#9ca3af', '#cbd5e1']
}

export function techGradient(tech) {
  return TECH_GRADIENTS[techClass(tech)] || TECH_GRADIENTS.none
}

// "B7 (2600 MHz) @15 MHz" / "n78 (3500 MHz) @80 MHz" -> {name, freq, bw, is5g}
export function parseBand(s) {
  if (!s) return null
  const str = String(s)
  const name = (str.match(/^[Bn]\d+/) || [])[0] || str.split(' ')[0]
  const freq = (str.match(/\((\d+\s*MHz)\)/) || [])[1] || null
  const bw = (str.match(/@\s*(\d+\s*MHz)/) || [])[1] || null
  const is5g = /^n/i.test(name)
  return { name, freq, bw, is5g, raw: str }
}
