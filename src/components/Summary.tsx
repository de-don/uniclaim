import { formatUsd } from '../lib/format'
import { hasFees } from '../lib/links'
import type { Position } from '../lib/types'

/**
 * Below this, a position's fees are not worth a transaction — and a wallet that
 * has traded for a while collects a long tail of such dust.
 */
const DUST_USD = 0.01

/**
 * Positions whose tokens have no price quote are counted: they cannot be ruled
 * out as dust, and silently dropping them would understate the total.
 */
function worthClaiming(position: Position): boolean {
  if (!hasFees(position)) return false
  return position.usd === null || position.usd >= DUST_USD
}

type Props = {
  /** Everything found, including positions with nothing to claim. */
  positions: Position[]
  chainCount: number
}

export function Summary({ positions, chainCount }: Props) {
  const withFees = positions.filter(hasFees)
  const totalUsd = withFees.reduce<number | null>(
    (sum, p) => (p.usd === null || sum === null ? sum : sum + p.usd),
    0,
  )

  const tiles: { label: string; value: string; title?: string }[] = [
    { label: 'Unclaimed fees', value: formatUsd(totalUsd) },
    {
      label: 'Positions ≥ $0.01',
      value: String(positions.filter(worthClaiming).length),
      title: 'Positions with fees worth at least $0.01. Tokens with no price quote are included.',
    },
    { label: 'Positions found', value: String(positions.length) },
    { label: 'Chains', value: String(chainCount) },
  ]

  return (
    <div className="summary">
      {tiles.map((tile) => (
        <div key={tile.label} title={tile.title}>
          <span className="summary__label">{tile.label}</span>
          <span className="summary__value">{tile.value}</span>
        </div>
      ))}
    </div>
  )
}
