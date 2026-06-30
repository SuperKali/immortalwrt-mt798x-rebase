export const UBUS_STATUS = {
  0: 'ok',
  1: 'invalid command',
  2: 'invalid argument',
  3: 'method not found',
  4: 'not found',
  5: 'no data',
  6: 'permission denied',
  7: 'timeout',
  8: 'not supported',
  9: 'unknown error',
  10: 'connection failed'
}

export function ubusStatusText(code) {
  return UBUS_STATUS[code] || `ubus error ${code}`
}
