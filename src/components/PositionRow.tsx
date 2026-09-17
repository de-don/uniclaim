import { formatAmount, formatFeeTier, formatUsd } from '../lib/format'
import type { Position } from '../lib/types'

type Props = {
  position: Position
  selected: boolean
  onToggle: (key: string) => void
  onClaim: (position: Position) => void
  busy: boolean
}

export function PositionRow({ position, selected, onToggle, onClaim, busy }: Props) {
  return (
    <div className={`row ${selected ? 'row--selected' : ''}`}>
      <label className="row__check">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(position.key)}
          aria-label={`Select position ${position.tokenId}`}
        />
      </label>

      <div className="row__pair">
        <span className="row__symbols">
          {position.token0.symbol} / {position.token1.symbol}
        </span>
        <span className="row__meta">
          <span className={`tag tag--${position.version}`}>{position.version}</span>
          <span className="tag">{formatFeeTier(position.fee)}</span>
          <span className={`tag ${position.inRange ? 'tag--in' : 'tag--out'}`}>
            {position.inRange ? 'in range' : 'out of range'}
          </span>
          <span className="row__id">#{position.tokenId.toString()}</span>
        </span>
      </div>

      <div className="row__fees">
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
      </div>

      <div className="row__usd">{formatUsd(position.usd)}</div>

      <button className="btn btn--ghost" onClick={() => onClaim(position)} disabled={busy}>
        Claim
      </button>
    </div>
  )
}
