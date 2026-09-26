import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useState, type FormEvent } from 'react'
import { CHAINS } from '../config/chains'
import { REPO_URL } from '../config/links'
import type { WatchStatus } from '../hooks/useWatchedAddress'
import { hasWalletConnect } from '../wagmi'

const STEPS = [
  {
    title: 'Connect your wallet',
    text: 'Nothing is signed. Connecting only tells the app which address to look up.',
  },
  {
    title: 'We scan every chain',
    text: `Your v3 and v4 positions are read straight from the contracts on ${CHAINS.length} chains, and the unclaimed fees are computed from live pool state.`,
  },
  {
    title: 'Claim in one transaction',
    text: 'Every position you select on a chain is packed into a single batched call — one signature, one gas fee.',
  },
]

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

  // The headline and lede below are mirrored as static markup in index.html so
  // crawlers and slow connections see them before the bundle loads. Change them
  // in both places.
  return (
    <div className="landing">
      <h1 className="landing__title">
        Claim fees from <span className="accent">every position</span> in one transaction
      </h1>
      <p className="landing__lede">
        UniClaim finds all of your Uniswap v3 and v4 positions, shows the fees you have earned but
        never collected, and claims them in a batch — one transaction per chain instead of one per
        position.
      </p>

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
    </div>
  )
}
