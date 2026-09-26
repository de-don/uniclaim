import { useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import { CHAIN_BY_ID } from '../config/chains'
import { formatAmount, formatUsd, shortAddress } from '../lib/format'
import { reviewChain, type ChainReview } from '../lib/review'
import type { Position } from '../lib/types'

export type ClaimSelection = { chainId: number; positions: Position[] }[]

type Props = {
  owner: `0x${string}`
  selection: ClaimSelection
  onConfirm: () => void
  onClose: () => void
}

function formatNative(value: bigint, decimals: number): string {
  const n = Number(formatUnits(value, decimals))
  if (n === 0) return '0'
  if (n < 0.000001) return '< 0.000001'
  return `≈ ${n.toPrecision(3).replace(/\.?0+$/, '')}`
}

function ChainSection({ owner, review }: { owner: `0x${string}`; review: ChainReview }) {
  const config = CHAIN_BY_ID.get(review.chainId)
  const explorer = config?.chain.blockExplorers?.default.url
  const gasUsd = review.gas?.usd ?? null
  // Claiming at a loss is legal, just rarely what anyone wants — say so before
  // the signature rather than after.
  const uneconomic = gasUsd !== null && review.unpriced === 0 && gasUsd > review.receiveUsd

  return (
    <section className="review__chain">
      <h3 className="review__title">
        <span className="group__dot" style={{ background: config?.color }} />
        {config?.chain.name}
        <span className="review__muted">
          {review.txs.length} transaction{review.txs.length === 1 ? '' : 's'}
        </span>
      </h3>

      <dl className="review__facts">
        <dt>Calls</dt>
        <dd>
          {review.txs.map((tx, i) => (
            <div key={i}>
              Uniswap {tx.version} position manager{' '}
              {explorer ? (
                <a href={`${explorer}/address/${tx.contract}`} target="_blank" rel="noreferrer">
                  <code>{shortAddress(tx.contract)}</code>
                </a>
              ) : (
                <code>{shortAddress(tx.contract)}</code>
              )}
              <div className="review__muted">{tx.method}</div>
            </div>
          ))}
        </dd>

        <dt>Pays out to</dt>
        <dd>
          <span>
            <code title={owner}>{shortAddress(owner)}</code>{' '}
            <span className="review__muted">— you</span>
          </span>
        </dd>

        <dt>You receive</dt>
        <dd>
          {review.receive.map(({ token, amount }) => (
            <div key={token.address}>
              {formatAmount(amount, token.decimals)} {token.symbol}
            </div>
          ))}
          <div className="review__muted">
            ≈ {formatUsd(review.receiveUsd)}
            {review.unpriced > 0 && ` + ${review.unpriced} unpriced`}
          </div>
        </dd>

        <dt>Network fee</dt>
        <dd>
          {review.gas ? (
            <>
              {formatNative(review.gas.native, review.gas.decimals)} {review.gas.symbol}
              {gasUsd !== null && <span className="review__muted"> ({formatUsd(gasUsd)})</span>}
            </>
          ) : (
            <span className="review__muted">could not be estimated</span>
          )}
        </dd>
      </dl>

      {review.simulation === 'ok' && (
        <p className="review__check review__check--ok">
          ✓ Simulated against the chain: the claim goes through
          {review.amountsFromChain
            ? ', and the amounts above are what the contract returned.'
            : '. Amounts are computed from pool state.'}
        </p>
      )}
      {review.simulation === 'reverted' && (
        <p className="review__check review__check--bad">
          ✕ The chain would reject this claim: {review.simulationError}. Sending it would only cost
          gas.
        </p>
      )}
      {review.simulation === 'unavailable' && (
        <p className="review__check review__check--warn">
          Could not simulate — the node did not answer. The claim may still work; your wallet will
          show its own preview.
        </p>
      )}
      {uneconomic && (
        <p className="review__check review__check--warn">
          The network fee is higher than the fees you would collect on this chain.
        </p>
      )}
    </section>
  )
}

/**
 * Shown between the Claim button and the wallet prompt: what is about to be
 * signed, in words, checked against the chain. A wallet shows raw calldata;
 * this is the version a person can actually read and compare.
 */
export function ClaimReview({ owner, selection, onConfirm, onClose }: Props) {
  const [reviews, setReviews] = useState<Map<number, ChainReview>>(new Map())

  useEffect(() => {
    let cancelled = false
    for (const { chainId, positions } of selection) {
      void reviewChain(chainId, positions, owner).then((review) => {
        if (!cancelled) setReviews((prev) => new Map(prev).set(chainId, review))
      })
    }
    return () => {
      cancelled = true
    }
  }, [owner, selection])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ready = selection.every(({ chainId }) => reviews.has(chainId))
  const all = [...reviews.values()]
  const blocked = all.some((r) => r.simulation === 'reverted')
  const chainCount = selection.length

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <aside
        className="panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Review claim"
      >
        <header className="panel__head">
          <h2 className="review__heading">Review before signing</h2>
          <button className="panel__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="panel__body">
          <p className="review__lede">
            Nothing is signed yet. This is what your wallet will ask you to approve, checked against
            the chain first. No token approval and no message signature is involved.
          </p>

          {selection.map(({ chainId }) => {
            const review = reviews.get(chainId)
            return review ? (
              <ChainSection key={chainId} owner={owner} review={review} />
            ) : (
              <section key={chainId} className="review__chain review__muted">
                Simulating on {CHAIN_BY_ID.get(chainId)?.chain.name}…
              </section>
            )
          })}
        </div>

        <footer className="panel__foot">
          {ready && all.length > 1 && (
            <span className="review__muted">
              Total ≈ {formatUsd(all.reduce((s, r) => s + r.receiveUsd, 0))}
              {all.every((r) => r.gas?.usd != null) &&
                ` · fees ≈ ${formatUsd(all.reduce((s, r) => s + (r.gas?.usd ?? 0), 0))}`}
            </span>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={onConfirm} disabled={!ready || blocked}>
            {!ready
              ? 'Checking…'
              : chainCount > 1
                ? `Claim on ${chainCount} chains`
                : 'Confirm in wallet'}
          </button>
        </footer>
      </aside>
    </div>
  )
}
