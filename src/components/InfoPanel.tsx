import { useEffect } from 'react'

export type InfoTab = 'how' | 'security' | 'faq'

const TABS: { id: InfoTab; label: string }[] = [
  { id: 'how', label: 'How it works' },
  { id: 'security', label: 'Security' },
  { id: 'faq', label: 'FAQ' },
]

type Props = {
  tab: InfoTab
  onTab: (tab: InfoTab) => void
  onClose: () => void
}

function HowItWorks() {
  return (
    <div className="prose">
      <h3>1 · Finding your positions</h3>
      <p>
        A Uniswap liquidity position is an NFT. The v3 position manager can list the token ids an
        address owns, so the app walks that list directly on chain — no indexer, no API key, nothing
        between you and the contract.
      </p>

      <h3>2 · Computing what you are owed</h3>
      <p>
        The <code>tokensOwed</code> field stored in the contract goes stale the moment a position is
        touched, so it is not the real number. The app derives the live figure from pool state the
        same way the contracts do:
      </p>
      <pre>
{`feeGrowthInside = feeGrowthGlobal − feeGrowthBelow − feeGrowthAbove
fees = tokensOwed + liquidity × (feeGrowthInside − feeGrowthInsideLast) / 2¹²⁸`}
      </pre>
      <p>
        Uniswap lets those accumulators overflow on purpose, so every subtraction is done modulo
        2²⁵⁶ — exactly as Solidity does it. The repository ships a script that checks the result
        against the chain itself: for each position it asks the contract what a claim would pay out
        and requires a match down to the wei.
      </p>

      <h3>3 · Claiming in one transaction</h3>
      <p>
        Each claim you select is encoded as a call and the whole set is submitted together through
        the position manager's own <code>multicall</code>. One signature, one gas fee, however many
        positions. Very large batches are split so a transaction cannot exceed the block gas limit.
      </p>
    </div>
  )
}

function Security() {
  return (
    <div className="prose">
      <h3>The app cannot take your money</h3>
      <p>
        This is not a promise about intentions — it is a property of the contracts. A claim pays out
        to the position's own owner. There is no recipient field for this app to point somewhere
        else, so the funds can only ever land in your wallet.
      </p>

      <h3>No token approvals, ever</h3>
      <p>
        Most drains happen through an <code>approve</code> signature that lets a contract spend your
        tokens later. UniClaim never asks for one. It never asks you to sign a message, either. The
        only thing you sign is the claim transaction itself, and your wallet shows you exactly what
        it does before you confirm.
      </p>

      <h3>Connecting is read-only</h3>
      <p>
        Connecting a wallet reveals your address and nothing more. No private key or seed phrase
        touches this app — your wallet never exposes them to a website, and no feature here would
        have anywhere to put one.
      </p>

      <h3>Verify rather than trust</h3>
      <p>
        The contract addresses are pinned per chain, and the app cross-checks them against the chain
        on startup: the v3 factory address is read out of the position manager rather than hardcoded,
        so a typo cannot silently redirect the maths at some other pool. The source is open — read
        it, or run it yourself.
      </p>
    </div>
  )
}

function Faq() {
  const items: { q: string; a: React.ReactNode }[] = [
    {
      q: 'Does everything really run locally?',
      a: (
        <>
          <p>
            Yes. UniClaim is a static page with no backend and no database. There is no account, no
            analytics and no server that sees your wallet. Your address is never stored anywhere.
          </p>
          <p>
            Being honest about the exceptions: a browser page cannot read a blockchain by itself, so
            two kinds of request leave your machine, and both carry only public data.
          </p>
          <ul>
            <li>
              <strong>Public RPC nodes</strong> — the blockchain reads. They see your address, as any
              node you query would. Point the app at your own node to avoid that.
            </li>
            <li>
              <strong>DefiLlama</strong> — token prices, so fees can be shown in dollars. It receives
              token addresses only, never your wallet.
            </li>
          </ul>
        </>
      ),
    },
    {
      q: 'Why does my wallet ask to switch networks?',
      a: (
        <p>
          Positions live on separate chains and a transaction only exists on one of them. Claiming on
          Arbitrum and on Base is necessarily two transactions, so the app switches the network for
          each one.
        </p>
      ),
    },
    {
      q: 'Why did one claim turn into several transactions?',
      a: (
        <p>
          Every position added to a batch costs gas, and a block has a ceiling. Past 25 positions on
          one chain the app splits the claim into consecutive transactions rather than building one
          that would fail. It is still far fewer than claiming individually.
        </p>
      ),
    },
    {
      q: 'I received WETH instead of ETH.',
      a: (
        <p>
          A v3 pool holds wrapped ETH, and that is what a claim pays out. Unwrapping would mean an
          extra step inside the same transaction; for now you can unwrap in any wallet or DEX.
        </p>
      ),
    },
    {
      q: 'A chain shows an error instead of my positions.',
      a: (
        <p>
          Public RPC nodes rate limit heavily. The app deliberately reports the failure rather than
          showing an empty list, because "no positions" and "we could not check" are very different
          answers. Press Refresh, or set your own endpoint with{' '}
          <code>VITE_RPC_&lt;chainId&gt;</code>.
        </p>
      ),
    },
    {
      q: 'Does claiming close my position or change my range?',
      a: (
        <p>
          No. Claiming only moves the fees that have already accrued. Your liquidity, your price
          range and the position itself are left exactly as they were, and it keeps earning.
        </p>
      ),
    },
    {
      q: 'Why is a position missing from the list?',
      a: (
        <p>
          Positions with nothing to claim are hidden — there is no reason to pay gas for a zero. A
          position that was closed and emptied is also skipped.
        </p>
      ),
    },
  ]

  return (
    <div className="prose">
      {items.map((item) => (
        <details key={item.q} className="faq">
          <summary>{item.q}</summary>
          <div className="faq__body">{item.a}</div>
        </details>
      ))}
    </div>
  )
}

export function InfoPanel({ tab, onTab, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <aside
        className="panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="About UniClaim"
      >
        <header className="panel__head">
          <nav className="panel__tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`panel__tab ${t.id === tab ? 'panel__tab--active' : ''}`}
                onClick={() => onTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button className="panel__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="panel__body">
          {tab === 'how' && <HowItWorks />}
          {tab === 'security' && <Security />}
          {tab === 'faq' && <Faq />}
        </div>
      </aside>
    </div>
  )
}
