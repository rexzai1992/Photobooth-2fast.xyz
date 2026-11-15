import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A unique id per build. The running booth polls /version.json and reloads itself
// (only while on the home screen) when a newer website build has been deployed.
const BUILD_ID = new Date().toISOString()

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
      },
    },
  ],
  build: {
    outDir: 'dist',
  }
})
