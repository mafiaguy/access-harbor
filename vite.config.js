import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  server: {
    host: '127.0.0.1',
    port: 8000,
  },
  build: {
    lib: {
      entry: 'auth-client.js',
      formats: ['es'],
      fileName: () => 'auth-client.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
  },
}));
