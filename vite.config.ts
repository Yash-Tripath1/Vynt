import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => ({
  // Relative assets work on GitHub Pages project paths and in Electron file URLs.
  base: './',
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
  plugins: [
    react(),
    ...(mode === 'web' ? [] : [electron({
      main: { entry: 'electron/main.ts' },
      preload: {
        input: path.join(root, 'electron/preload.ts'),
        vite: { build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'preload.cjs' } } } },
      },
    })]),
  ],
}))
