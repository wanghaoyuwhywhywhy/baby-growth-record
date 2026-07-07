import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  build: {
    sourcemap: 'hidden',
    outDir: 'docs',
  },
  plugins: [
    react({
      babel: {
        // react-dev-locator 仅用于开发期定位组件源码路径，
        // 生产构建注入会把源码文件路径打到 DOM（data-* 属性），泄露项目结构，故仅在 dev 启用
        plugins: mode === 'development' ? ['react-dev-locator'] : [],
      },
    }),
    tsconfigPaths(),
    VitePWA({
      registerType: 'autoUpdate',
      // 关闭自动注入的内联注册脚本（CSP script-src 'self' 会拦截内联脚本，导致 PWA 失效）
      // 改为在 main.tsx 中通过 virtual:pwa-register 同源模块手动注册
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '宝宝成长记录',
        short_name: '成长记录',
        description: '记录宝宝成长的每一个瞬间',
        theme_color: '#FF7B7B',
        background_color: '#FFF8F5',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512.png',
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
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // 不缓存 /api/asset：视频 302 重定向和语音代理响应经 service worker 缓存后
        // 会变成 opaque 响应，导致 <video>/<audio> 无法做 Range 请求而加载失败
        // 浏览器原生 HTTP 缓存已足够处理媒体文件
      },
    }),
  ],
}));
