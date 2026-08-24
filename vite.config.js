import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import packageJson from './package.json' with { type: 'json' }

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [
      react(),
      VitePWA({
        disable: env.VITE_EMBEDDED === 'true',
        registerType: 'autoUpdate',
        manifest: {
          name: env.VITE_APP_TITLE || 'CiviScan',
          short_name: env.VITE_APP_TITLE || 'CiviScan',
          description: 'Scanner for CiviCRM Event Participants',
          theme_color: env.VITE_APP_COLOR_PRIMARY || '#00577b',
          background_color: '#ffffff',
          display: 'standalone',
          id: env.VITE_APP_BASE || '/scan/',
          start_url: env.VITE_APP_BASE || '/scan/',
          icons: [
            {
              src: 'civicrm_logo.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            },
            {
              src: 'civicrm_logo.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ],
          screenshots: [
            {
              src: "screenshot-mobile.png",
              sizes: "750x1333",
              type: "image/png",
              form_factor: "narrow",
              label: "Mobile Home Screen"
            },
            {
              src: "screenshot-desktop.png",
              sizes: "1280x719",
              type: "image/png",
              form_factor: "wide",
              label: "Desktop Dashboard"
            }
          ]
        }
      }),
      {
        name: 'html-transform',
        transformIndexHtml(html) {
          return html
            .replace(/__VITE_APP_COLOR_PRIMARY__/g, env.VITE_APP_COLOR_PRIMARY || '#00577b')
            .replace(/<{ VITE_APP_TITLE }>/g, env.VITE_APP_TITLE || 'CiviScan')
            .replace(/__VITE_FEATURE_OAUTH__/g, env.VITE_FEATURE_OAUTH || 'false')
            .replace(/__VITE_OAUTH_AUTHORITY__/g, env.VITE_OAUTH_AUTHORITY || '')
            .replace(/__VITE_OAUTH_CLIENT_ID__/g, env.VITE_OAUTH_CLIENT_ID || '')
        },
      },
    ],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().split('T')[0]),
    },
    base: './',
    build: {
      outDir: env.VITE_EMBEDDED === 'true' ? '../dist' : 'dist',
      emptyOutDir: true,
      manifest: true,
    },
  }
})
