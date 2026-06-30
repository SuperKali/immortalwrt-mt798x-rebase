import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// During `npm run dev`, proxy ubus/cgi/luci-static to the live router so the SPA
// runs against real data with HMR. Override the target with ROUTER_IP=...
const ROUTER = process.env.ROUTER_IP || 'http://192.168.7.1'

export default defineConfig({
  plugins: [vue()],
  // Served from /www/linkup/ on the device.
  base: '/linkup/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { vendor: ['vue', 'vue-router', 'pinia', 'vue-i18n'] } }
    }
  },
  server: {
    host: true,
    proxy: {
      '/ubus': { target: ROUTER, changeOrigin: true },
      '/cgi-bin': { target: ROUTER, changeOrigin: true },
      '/luci-static': { target: ROUTER, changeOrigin: true }
    }
  }
})
