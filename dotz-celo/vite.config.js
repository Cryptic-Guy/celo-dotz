import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      '9ebd125e-000d-4dc0-b619-c9837bacf338-00-sdzr2nyi3yo4.pike.replit.dev',
    ],
    port: 8080,
    strictPort: true,
    hmr: {
      clientPort: 443,
    },
  },

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
});