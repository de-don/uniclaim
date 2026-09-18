import { ConnectButton } from '@rainbow-me/rainbowkit'
import { CHAINS } from '../config/chains'
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
}

export function Landing({ onOpenInfo }: Props) {
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
        Everything runs in your browser. There is no backend, no account, and no way for this app
        to move your funds.{' '}
        <button className="link" onClick={() => onOpenInfo('security')}>
          How that works
        </button>
      </p>
    </div>
  )
}
