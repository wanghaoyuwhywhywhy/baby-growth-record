import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  base: '/baby-growth-record/',
  build: {
    sourcemap: 'hidden',
    outDir: 'docs',
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }),
    tsconfigPaths(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '宝宝成长记录',
        short_name: '成长记录',
        description: '记录宝宝成长的每一个瞬间',
        theme_color: '#FF7B7B',
        background_color: '#FFF8F5',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/baby-growth-record/',
        start_url: '/baby-growth-record/',
        icons: [
          {
            src: '/baby-growth-record/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/baby-growth-record/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,ttf,woff,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: '/baby-growth-record/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
})
