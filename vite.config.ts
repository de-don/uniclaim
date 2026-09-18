import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  /*
   * GitHub Pages serves a project site from /<repo>/, so the bundle needs to
   * know its prefix at build time. CI passes it; a local build or dev server
   * leaves it at the root.
   */
  base: process.env.VITE_BASE ?? '/',
})
