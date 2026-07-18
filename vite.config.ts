import preact from '@preact/preset-vite'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  resolve: {
    alias: {
      // Basecoat's package exports don't expose the standalone (Tailwind-free)
      // bundle, only the Tailwind-source ones — alias it so main.tsx can import it.
      'basecoat-standalone.css': fileURLToPath(
        new URL('./node_modules/basecoat-css/dist/basecoat.cdn.css', import.meta.url),
      ),
    },
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      // Default glob skips fonts; without this the self-hosted font dies offline.
      // Geist ships 5 unicode subsets — only precache the latin ones we use.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/geist-cyrillic*', '**/geist-vietnamese*'],
      },
      manifest: {
        name: 'Training',
        short_name: 'Training',
        description: 'Personal progressive training plans — push-ups, pull-ups and friends.',
        display: 'standalone',
        background_color: '#1a1512',
        theme_color: '#1a1512',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
