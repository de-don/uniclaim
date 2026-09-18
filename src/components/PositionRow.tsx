import { formatAmount, formatFeeTier, formatUsd } from '../lib/format'
import { hasFees, positionUrl, positionUrlLabel } from '../lib/links'
import type { Position } from '../lib/types'

type Props = {
  position: Position
  selected: boolean
  onToggle: (key: string) => void
  onClaim: (position: Position) => void
  busy: boolean
}

export function PositionRow({ position, selected, onToggle, onClaim, busy }: Props) {
  // A v4 pool may route through a hook contract; worth surfacing, since it is
  // the one thing that can make an otherwise ordinary pool behave differently.
  const hasHook = Boolean(position.hooks && BigInt(position.hooks) !== 0n)
  const claimable = hasFees(position)
  const url = positionUrl(position)

  return (
    <div className={`row ${selected ? 'row--selected' : ''} ${claimable ? '' : 'row--empty'}`}>
      <label className="row__check">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(position.key)}
          disabled={!claimable}
          aria-label={`Select position ${position.tokenId}`}
          title={claimable ? undefined : 'Nothing to claim on this position'}
        />
      </label>

      <div className="row__pair">
        {url ? (
          <a
            className="row__symbols row__symbols--link"
            href={url}
            target="_blank"
            rel="noreferrer"
            title={positionUrlLabel(position)}
          >
            {position.token0.symbol} / {position.token1.symbol}
            <span className="row__out" aria-hidden="true">
              ↗
            </span>
          </a>
        ) : (
          <span className="row__symbols">
            {position.token0.symbol} / {position.token1.symbol}
          </span>
        )}
        <span className="row__meta">
          <span className={`tag tag--${position.version}`}>{position.version}</span>
          <span className="tag">{formatFeeTier(position.fee)}</span>
          <span className={`tag ${position.inRange ? 'tag--in' : 'tag--out'}`}>
            {position.inRange ? 'in range' : 'out of range'}
          </span>
          {hasHook && (
            <span className="tag tag--hook" title={`Pool hook ${position.hooks}`}>
              hook
            </span>
          )}
          <span className="row__id">#{position.tokenId.toString()}</span>
        </span>
      </div>

      <div className="row__fees">
        {claimable ? (
          <>
            {position.fees0 > 0n && (
              <span>
                {formatAmount(position.fees0, position.token0.decimals)} {position.token0.symbol}
              </span>
            )}
            {position.fees1 > 0n && (
              <span>
                {formatAmount(position.fees1, position.token1.decimals)} {position.token1.symbol}
              </span>
            )}
          </>
        ) : (
          <span className="row__none">no fees yet</span>
        )}
      </div>

      <div className="row__usd">{claimable ? formatUsd(position.usd) : '—'}</div>

      <button
        className="btn btn--ghost"
        onClick={() => onClaim(position)}
        disabled={busy || !claimable}
        title={claimable ? undefined : 'Nothing to claim on this position'}
      >
        Claim
      </button>
    </div>
  )
}
