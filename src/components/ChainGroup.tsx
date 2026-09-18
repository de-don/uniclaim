import type { ChainConfig } from '../config/chains'
import { formatUsd } from '../lib/format'
import { hasFees } from '../lib/links'
import type { Position } from '../lib/types'
import { batchCount, type ClaimState } from '../hooks/useClaim'
import { PositionRow } from './PositionRow'

type Props = {
  config: ChainConfig
  positions: Position[]
  selected: Set<string>
  onToggle: (key: string) => void
  onToggleChain: (chainId: number, next: boolean) => void
  onClaim: (chainId: number, positions: Position[]) => void
  claimState: ClaimState
}

export function ChainGroup({
  config,
  positions,
  selected,
  onToggle,
  onToggleChain,
  onClaim,
  claimState,
}: Props) {
  const chainId = config.chain.id
  // Rows with nothing to claim are shown for completeness, but every action
  // here ignores them: batching one in would spend gas to collect zero.
  const claimable = positions.filter(hasFees)
  const selectedHere = claimable.filter((p) => selected.has(p.key))
  const allSelected = claimable.length > 0 && selectedHere.length === claimable.length

  const totalUsd = claimable.reduce<number | null>(
    (sum, p) => (p.usd === null || sum === null ? sum : sum + p.usd),
    0,
  )

  const busy =
    claimState.chainId === chainId &&
    ['switching', 'signing', 'pending'].includes(claimState.status)

  const explorer = config.chain.blockExplorers?.default.url
  const batch = claimState.batch
  const progress = batch && batch.total > 1 ? ` ${batch.index} of ${batch.total}` : ''
  const txCount = batchCount(claimable)
  // Two different reasons produce more than one transaction, and saying "gas"
  // when the real cause is the v3/v4 split would just be wrong.
  const versions = new Set(claimable.map((p) => p.version))
  const txReason =
    txCount === 1
      ? 'A single transaction for every position'
      : versions.size > 1 && txCount === versions.size
        ? 'v3 and v4 are separate contracts, so each needs its own transaction'
        : `Sent as ${txCount} transactions — this many positions will not fit in one block`

  return (
    <section className="group">
      <header className="group__head">
        <label className="group__check">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={claimable.length === 0}
            onChange={(e) => onToggleChain(chainId, e.target.checked)}
            aria-label={`Select all positions on ${config.chain.name}`}
          />
        </label>

        <span className="group__dot" style={{ background: config.color }} />
        <h2 className="group__name">{config.chain.name}</h2>
        <span className="group__count">
          {claimable.length} of {positions.length} with fees
          {txCount > 1 && ` · ${txCount} transactions`}
        </span>
        <span className="group__usd">{formatUsd(totalUsd)}</span>

        <div className="group__actions">
          {selectedHere.length > 0 && selectedHere.length < claimable.length && (
            <button className="btn" onClick={() => onClaim(chainId, selectedHere)} disabled={busy}>
              Claim selected ({selectedHere.length})
            </button>
          )}
          <button
            className="btn btn--primary"
            onClick={() => onClaim(chainId, claimable)}
            disabled={busy || claimable.length === 0}
            title={txReason}
          >
            {busy ? 'Sending…' : `Claim all (${claimable.length})`}
          </button>
        </div>
      </header>

      {claimState.chainId === chainId && claimState.status !== 'idle' && (
        <div className={`banner banner--${claimState.status}`}>
          {claimState.status === 'switching' && 'Switch network in your wallet…'}
          {claimState.status === 'signing' && `Confirm transaction${progress} in your wallet…`}
          {claimState.status === 'pending' && `Transaction${progress} sent, waiting for it to land…`}
          {claimState.status === 'success' && 'Fees claimed.'}
          {claimState.status === 'error' && `Failed: ${claimState.error}`}
          {claimState.hash && explorer && (
            <a href={`${explorer}/tx/${claimState.hash}`} target="_blank" rel="noreferrer">
              View on explorer
            </a>
          )}
        </div>
      )}

      <div className="group__rows">
        {positions.map((position) => (
          <PositionRow
            key={position.key}
            position={position}
            selected={selected.has(position.key)}
            onToggle={onToggle}
            onClaim={(p) => onClaim(chainId, [p])}
            busy={busy}
          />
        ))}
      </div>
    </section>
  )
}
