import { useEffect } from 'react'
import { CHAIN_BY_ID } from '../config/chains'
import { V4_CHAINS } from '../config/v4'

const V4_CHAIN_NAMES = V4_CHAINS.map((v) => CHAIN_BY_ID.get(v.chainId)?.chain.name ?? String(v.chainId))

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
      <p>
        v4 is not enumerable: its position manager deliberately omits that list, so no amount of
        contract reading will tell you which positions an address holds. Candidate ids therefore
        come from a public block explorer, and each one is then checked against <code>ownerOf</code>{' '}
        on chain before it is shown. The explorer is a hint, never an authority — see the Security
        section for why a wrong answer from it is harmless.
      </p>

      <h3>2 · Computing what you are owed</h3>
      <p>
        The <code>tokensOwed</code> field stored in the contract goes stale the moment a position is
        touched, so it is not the real number. The app derives the live figure from pool state the
        same way the contracts do:
      </p>
      <pre>
{`feeGrowthInside =
    feeGrowthGlobal − feeGrowthBelow − feeGrowthAbove

fees = tokensOwed
     + liquidity × (feeGrowthInside − feeGrowthInsideLast) / 2¹²⁸`}
      </pre>
      <p>
        Uniswap lets those accumulators overflow on purpose, so every subtraction is done modulo
        2²⁵⁶ — exactly as Solidity does it. The repository ships a script that checks the result
        against the chain itself: for each position it asks the contract what a claim would pay out
        and requires a match down to the wei.
      </p>

      <h3>3 · Claiming in one transaction</h3>
      <p>
        Each claim you select is encoded and the whole set is submitted together: through the
        position manager's own <code>multicall</code> on v3, and as a single unlock on v4, where
        fees are realised by decreasing liquidity by zero and then closing each currency. One
        signature, one gas fee, however many positions. Very large batches are split so a
        transaction cannot exceed the block gas limit, and a selection that spans both protocol
        versions needs one transaction each.
      </p>
    </div>
  )
}

function Security() {
  return (
    <div className="prose">
      <h3>The app cannot take your money</h3>
      <p>
        This is not a promise about intentions — it is a property of the contracts. On v3 a claim
        pays out to the position's own owner. On v4 the app closes each currency with an action that
        credits whoever sent the transaction. Neither path takes a recipient this app could point
        somewhere else, so the funds can only ever land in your wallet.
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

      <h3>What the v4 explorer lookup can and cannot do</h3>
      <p>
        For v4 the app has to ask an explorer which position ids you hold, because the contract
        refuses to say. That answer is a list of numbers and nothing else. Each number is checked
        against <code>ownerOf</code> on chain and discarded unless it really is yours, and every
        figure shown for it is read from the pool, not from the explorer. The worst a bad answer can
        do is hide a position of yours or waste a lookup on one that is not — it cannot show you
        someone else's position, inflate a balance, or change where a claim pays out.
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
            three kinds of request leave your machine, and all of them carry only public data.
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
            <li>
              <strong>A public block explorer</strong> — for v4 only, and only to ask which position
              ids an address holds, because the v4 contract cannot be asked directly. Every id that
              comes back is verified on chain, so a wrong or hostile answer cannot do more than waste
              a lookup.
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
          extra step inside the same transaction; for now you can unwrap in any wallet or DEX. v4
          pools that use native ETH pay out native ETH, with nothing to unwrap.
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
      q: 'Are my v4 positions supported everywhere?',
      a: (
        <p>
          v4 needs a position lookup the contract does not provide, so it works on the chains where
          a public explorer offers one: {V4_CHAIN_NAMES.join(', ')}. The other chains still show
          every v3 position, and the app says which is which.
        </p>
      ),
    },
    {
      q: 'What does the "hook" label on a position mean?',
      a: (
        <p>
          v4 pools can attach a hook contract that runs custom logic around pool operations. It does
          not change how fees are claimed here, but it is worth knowing which of your pools has one,
          so the label is shown when a pool is hooked.
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
        <>
          <p>
            Positions with nothing to claim are hidden by default, since there is no reason to pay
            gas for a zero. Untick <strong>Hide positions with no fees</strong> to see them; they
            appear greyed out and stay out of every claim, because batching one in would spend gas
            to collect nothing.
          </p>
          <p>
            A position that was closed and fully emptied is not listed at all — it holds neither
            liquidity nor fees, so there is nothing left to show.
          </p>
          <p>
            The <strong>Positions ≥ $0.01</strong> figure at the top leaves out fees too small to be
            worth a transaction, which is why it can be lower than the number of rows you see.
            Nothing is hidden by it — dust positions are still listed and still claimable.
          </p>
        </>
      ),
    },
    {
      q: 'What happens when I click a position?',
      a: (
        <p>
          It opens that exact position on the Uniswap interface, where you can see its range and
          manage it. Should a chain ever be added that Uniswap has no page for, the link falls back
          to the position's NFT on that chain's block explorer.
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
