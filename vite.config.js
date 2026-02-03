import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import VitePluginHtmlEnv from 'vite-plugin-html-env'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [
      react(),
      VitePluginHtmlEnv(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: env.VITE_APP_TITLE || 'CiviScan',
          short_name: env.VITE_APP_TITLE || 'CiviScan',
          description: 'Scanner for CiviCRM Event Participants',
          theme_color: env.VITE_APP_COLOR_PRIMARY || '#00577b',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/scan/',
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
          return html.replace(
            /%VITE_APP_COLOR_PRIMARY%/g,
            env.VITE_APP_COLOR_PRIMARY || '#00577b'
          )
        },
      },
    ],
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().split('T')[0]),
    },
    base: '/scan/',
  }
})
