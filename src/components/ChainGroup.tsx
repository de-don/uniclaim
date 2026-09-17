import type { ChainConfig } from '../config/chains'
import { formatUsd } from '../lib/format'
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
  const selectedHere = positions.filter((p) => selected.has(p.key))
  const allSelected = positions.length > 0 && selectedHere.length === positions.length

  const totalUsd = positions.reduce<number | null>(
    (sum, p) => (p.usd === null || sum === null ? sum : sum + p.usd),
    0,
  )

  const busy =
    claimState.chainId === chainId &&
    ['switching', 'signing', 'pending'].includes(claimState.status)

  const explorer = config.chain.blockExplorers?.default.url
  const batch = claimState.batch
  const progress = batch && batch.total > 1 ? ` ${batch.index} of ${batch.total}` : ''
  const txCount = batchCount(positions.length)

  return (
    <section className="group">
      <header className="group__head">
        <label className="group__check">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleChain(chainId, e.target.checked)}
            aria-label={`Select all positions on ${config.chain.name}`}
          />
        </label>

        <span className="group__dot" style={{ background: config.color }} />
        <h2 className="group__name">{config.chain.name}</h2>
        <span className="group__count">
          {positions.length} {positions.length === 1 ? 'position' : 'positions'}
          {txCount > 1 && ` · ${txCount} transactions`}
        </span>
        <span className="group__usd">{formatUsd(totalUsd)}</span>

        <div className="group__actions">
          {selectedHere.length > 0 && selectedHere.length < positions.length && (
            <button className="btn" onClick={() => onClaim(chainId, selectedHere)} disabled={busy}>
              Claim selected ({selectedHere.length})
            </button>
          )}
          <button
            className="btn btn--primary"
            onClick={() => onClaim(chainId, positions)}
            disabled={busy}
            title={
              txCount > 1
                ? `Sent as ${txCount} transactions — this many positions will not fit in one block`
                : 'A single transaction for every position'
            }
          >
            {busy ? 'Sending…' : `Claim all (${positions.length})`}
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
