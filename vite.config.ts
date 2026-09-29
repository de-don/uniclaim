import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { FAQ, GUIDE_PATH, HERO, STEPS } from './src/content/landing.ts'

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

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Writes the landing copy into index.html as plain markup, from the same module
 * the React landing renders, so a crawler that does not run JavaScript reads
 * the headline, the steps and the questions — and they can never disagree with
 * the page. React replaces it on mount. The questions also go into FAQPage
 * structured data, which is what search results can quote.
 */
function staticLanding(): Plugin {
  return {
    name: 'uniclaim:static-landing',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.path !== '/index.html') return html

        const landing = `
          <div class="landing">
            <h1 class="landing__title">${escapeHtml(HERO.before)}<span class="accent">${escapeHtml(HERO.accent)}</span>${escapeHtml(HERO.after)}</h1>
            <p class="landing__lede">${escapeHtml(HERO.lede)}</p>
            <ol class="steps">${STEPS.map(
              (step, i) =>
                `<li class="step"><span class="step__num">${i + 1}</span><div><h3 class="step__title">${escapeHtml(step.title)}</h3><p class="step__text">${escapeHtml(step.text)}</p></div></li>`,
            ).join('')}</ol>
            <section class="landing__faq"><h2 class="landing__faq-title">Questions</h2>${FAQ.map(
              (item) =>
                `<details class="landing__qa"><summary>${escapeHtml(item.q)}</summary><p>${escapeHtml(item.a)}</p></details>`,
            ).join('')}<p class="landing__guide"><a class="link" href="${GUIDE_PATH}">Guide: how to collect Uniswap fees from multiple positions at once →</a></p></section>
          </div>`

        const faqLd = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        })

        return html
          .replace('<!--static-landing-->', landing)
          .replace(
            '<!--faq-jsonld-->',
            `<script type="application/ld+json">${faqLd.replace(/</g, '\\u003c')}</script>`,
          )
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), staticLanding()],
  /*
   * GitHub Pages serves a project site from /<repo>/, so the bundle needs to
   * know its prefix at build time. CI passes it; a local build or dev server
   * leaves it at the root.
   */
  base: process.env.VITE_BASE ?? '/',
  define: {
    __COMMIT_SHA__: JSON.stringify(commitSha()),
  },
  build: {
    rollupOptions: {
      // The guide is a plain static page, so it is fully readable without
      // JavaScript — the one page here written to be found by search.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        guide: resolve(import.meta.dirname, `${GUIDE_PATH.slice(1)}/index.html`),
      },
    },
  },
})
