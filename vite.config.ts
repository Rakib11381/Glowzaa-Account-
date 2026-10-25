import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      {
        name: 'suppress-vite-hmr-websocket-error',
        enforce: 'post' as const,
        transform(code: string, id: string) {
          if (id.includes('vite/dist/client/client.mjs') || id.includes('@vite/client')) {
            return code
              .replace(
                /const createWebSocketModuleRunnerTransport = \(options\) => \{[\s\S]*?\n\};\n/,
                `const createWebSocketModuleRunnerTransport = () => ({\n  async connect() {},\n  disconnect() {},\n  send() {}\n});\n`
              )
              .replace(
                /throw new Error\(["']send was called before connect["']\);/g,
                'return;'
              )
              .replace(
                /throw new Error\(["']invoke was called before connect["']\);/g,
                'return;'
              )
              .replace(
                /reject\(new Error\(["']WebSocket closed without opened\.["']\)\);/g,
                'resolve();'
              );
          }
          return null;
        },
      },
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
        manifest: {
          id: '/',
          name: 'Glowzaa Shop - Business Partner Accounting',
          short_name: 'Glowzaa',
          description:
            'বাংলা-ভিত্তিক ব্যবসায়িক অংশীদার হিসাবরক্ষণ অ্যাপ: বিনিয়োগ, বিক্রয়, স্টক ক্রয়, কস্ট অব গুডস সোল্ড (COGS), নিট লাভ ও ইনভেস্টর লেজার।',
          theme_color: '#091e32',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          categories: ['business', 'finance', 'productivity'],
          icons: [
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: false as const,
      ws: false as const,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});