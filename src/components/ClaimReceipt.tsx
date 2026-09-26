import { CHAIN_BY_ID } from '../config/chains'
import type { ClaimResult } from '../hooks/useClaim'
import { formatAmount } from '../lib/format'
import { sumByToken } from '../lib/review'

type Props = {
  result: ClaimResult
  onDismiss: () => void
}

/**
 * What a claim actually did, kept above the list. It cannot live inside the
 * chain's own card: claiming everything on a chain empties that card, and the
 * confirmation would vanish with it.
 */
export function ClaimReceipt({ result, onDismiss }: Props) {
  const config = CHAIN_BY_ID.get(result.chainId)
  const name = config?.chain.name ?? `chain ${result.chainId}`
  const explorer = config?.chain.blockExplorers?.default.url
  const received = sumByToken(result.claimed)
  const amounts = received
    .map(({ token, amount }) => `${formatAmount(amount, token.decimals)} ${token.symbol}`)
    .join(' + ')

  let tone: 'success' | 'cancelled' | 'error' = result.outcome
  let text: string
  if (result.outcome === 'success') {
    text = `Claimed on ${name}: ${amounts}.`
  } else if (result.claimed.length > 0) {
    // Earlier batches landed before the later one was declined or failed.
    tone = 'success'
    text = `Partly claimed on ${name}: ${amounts}. The rest was ${
      result.outcome === 'cancelled' ? 'cancelled in your wallet' : `not sent — ${result.error}`
    }.`
  } else if (result.outcome === 'cancelled') {
    text = `Cancelled in your wallet on ${name} — nothing was sent.`
  } else {
    text = `Claim on ${name} failed: ${result.error}`
  }

  return (
    <div className={`banner banner--receipt banner--${tone}`} role="status">
      <span>{text}</span>
      <span className="banner__actions">
        {explorer &&
          result.hashes.map((hash, i) => (
            <a key={hash} href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
              {result.hashes.length > 1 ? `Transaction ${i + 1}` : 'View transaction'} ↗
            </a>
          ))}
        <button className="banner__close" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      </span>
    </div>
  )
}
