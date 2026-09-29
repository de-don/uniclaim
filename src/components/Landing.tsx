import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useState, type FormEvent } from 'react'
import { CHAINS } from '../config/chains'
import { REPO_URL } from '../config/links'
import type { WatchStatus } from '../hooks/useWatchedAddress'
import { CHAIN_COUNT, FAQ, GUIDE_PATH, HERO, STEPS } from '../content/landing'
import { hasWalletConnect } from '../wagmi'

// The count in the copy is a literal so vite.config.ts can load the copy
// outside the browser; this keeps it honest when a chain is added or removed.
if (import.meta.env.DEV && CHAINS.length !== CHAIN_COUNT) {
  console.warn(`content/landing.ts says ${CHAIN_COUNT} chains, config has ${CHAINS.length}`)
}

type Props = {
  onOpenInfo: (tab: 'how' | 'security' | 'faq') => void
  onLookup: (query: string) => void
  lookupStatus: WatchStatus
  lookupError?: string
  lookupQuery: string
}

export function Landing({ onOpenInfo, onLookup, lookupStatus, lookupError, lookupQuery }: Props) {
  const [draft, setDraft] = useState(lookupQuery)
  const resolving = lookupStatus === 'resolving'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onLookup(draft)
  }

  // The build writes the same hero, steps and questions into index.html as
  // static markup, from the same module, for crawlers and slow connections.
  return (
    <div className="landing">
      <h1 className="landing__title">
        {HERO.before}
        <span className="accent">{HERO.accent}</span>
        {HERO.after}
      </h1>
      <p className="landing__lede">{HERO.lede}</p>

      <ol className="steps">
        {STEPS.map((step, i) => (
          <li key={step.title} className="step">
            <span className="step__num">{i + 1}</span>
            <div>
              <h3 className="step__title">{step.title}</h3>
              <p className="step__text">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="landing__cta">
        <ConnectButton />
      </div>

      {/* Seeing what the app finds before connecting anything is the honest
          answer to "why should I connect my wallet to a site I do not know". */}
      <form className="lookup" onSubmit={submit}>
        <label className="lookup__label" htmlFor="lookup">
          Or look up any address first — no wallet needed
        </label>
        <div className="lookup__row">
          <input
            id="lookup"
            className="lookup__input"
            placeholder="0x… or name.eth"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
          />
          <button className="btn" type="submit" disabled={!draft.trim() || resolving}>
            {resolving ? 'Resolving…' : 'View'}
          </button>
        </div>
        {lookupStatus === 'error' && lookupError && (
          <p className="lookup__error" role="alert">
            {lookupError}
          </p>
        )}
      </form>

      {!hasWalletConnect && (
        <p className="landing__warn">
          WalletConnect is not configured on this build, so mobile wallets cannot connect. Browser
          extension wallets work as normal. Set <code>VITE_WC_PROJECT_ID</code> in{' '}
          <code>.env</code> to enable the rest.
        </p>
      )}

      {/* Every claim here is still true with analytics on the hosted site. What
          this line must never regain is the old "no tracking" promise — the
          FAQ's list of outgoing requests is where the full picture lives. */}
      <p className="landing__note">
        Everything runs in your browser. There is no backend, no account, and no way for this app to
        move your funds — and the{' '}
        <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
          source is public
        </a>{' '}
        if you would rather check than take that on faith.{' '}
        <button className="link" onClick={() => onOpenInfo('security')}>
          How that works
        </button>
      </p>

      <section className="landing__faq" aria-labelledby="landing-faq">
        <h2 id="landing-faq" className="landing__faq-title">
          Questions
        </h2>
        {FAQ.map((item) => (
          <details key={item.q} className="landing__qa">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
        <p className="landing__guide">
          <a className="link" href={GUIDE_PATH}>
            Guide: how to collect Uniswap fees from multiple positions at once →
          </a>
        </p>
      </section>
    </div>
  )
}
