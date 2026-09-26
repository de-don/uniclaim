import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The commit the bundle was built from, shown in the footer and linked to on
 * GitHub, so "the site runs the public source" is something a visitor can
 * check rather than take on faith. Hosts that build from a shallow checkout
 * pass it in the environment; a local build asks git.
 */
function commitSha(): string {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA
  if (fromEnv) return fromEnv
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  plugins: [react()],
  /*
   * GitHub Pages serves a project site from /<repo>/, so the bundle needs to
   * know its prefix at build time. CI passes it; a local build or dev server
   * leaves it at the root.
   */
  base: process.env.VITE_BASE ?? '/',
  define: {
    __COMMIT_SHA__: JSON.stringify(commitSha()),
  },
})
