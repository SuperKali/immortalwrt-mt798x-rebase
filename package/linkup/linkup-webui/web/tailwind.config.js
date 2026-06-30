/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        card: 'var(--card)',
        muted: 'var(--muted)',
        fg: 'var(--fg)',
        fg2: 'var(--fg-2)',
        border: 'var(--border)',
        ring: 'var(--ring)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-fg': 'var(--accent-fg)',
        primary: 'var(--accent)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        info: 'var(--info)',
        destructive: 'var(--destructive)',
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
          6: 'var(--chart-6)'
        },
        q: {
          ex: 'var(--q-ex)',
          good: 'var(--q-good)',
          weak: 'var(--q-weak)',
          poor: 'var(--q-poor)',
          none: 'var(--q-none)'
        }
      },
      fontFamily: {
        sans: ['Inter Variable', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        card: '0 1px 2px 0 hsl(var(--shadow-color) / 0.04), 0 1px 3px 0 hsl(var(--shadow-color) / 0.07)',
        'card-hover': '0 6px 16px -4px hsl(var(--shadow-color) / 0.12), 0 2px 6px -2px hsl(var(--shadow-color) / 0.08)',
        hero: '0 10px 30px -8px hsl(264 60% 40% / 0.35)'
      }
    }
  },
  plugins: []
}
