import { defineStore } from 'pinia'

const CAP = 90
function push(arr, v) { arr.push(v); if (arr.length > CAP) arr.shift() }

// Session-scoped time-series for the dashboard charts (resets on full reload;
// a backend collector daemon could make this persistent later).
export const useHistoryStore = defineStore('history', {
  state: () => ({
    down: [], up: [],
    rsrp: [], sinr: [],
    nrRsrp: [], nrSinr: [],
    rtt: [],
    rttLast: null, lossLast: null
  }),
  getters: {
    rttAvg: (s) => (s.rtt.length ? s.rtt.reduce((a, b) => a + b, 0) / s.rtt.length : 0),
    jitter: (s) => {
      const a = s.rtt
      if (a.length < 2) return 0
      let sum = 0
      for (let i = 1; i < a.length; i++) sum += Math.abs(a[i] - a[i - 1])
      return sum / (a.length - 1)
    }
  },
  actions: {
    pushThroughput(d, u) { push(this.down, d); push(this.up, u) },
    pushSignal(sig) {
      if (!sig) return
      if (sig.rsrp != null) push(this.rsrp, sig.rsrp)
      if (sig.sinr != null) push(this.sinr, sig.sinr)
      if (sig.nr_rsrp != null) push(this.nrRsrp, sig.nr_rsrp)
      if (sig.nr_sinr != null) push(this.nrSinr, sig.nr_sinr)
    },
    pushLatency(rtt, loss) {
      if (rtt != null) push(this.rtt, rtt)
      this.rttLast = rtt
      this.lossLast = loss
    }
  }
})
