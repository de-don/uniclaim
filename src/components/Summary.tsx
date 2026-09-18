import { formatUsd } from '../lib/format'
import { hasFees } from '../lib/links'
import type { Position } from '../lib/types'

/** "3 v3 · 2 v4", or just one side when the other is empty. */
function versionSplit(positions: Position[]): string {
  const v3 = positions.filter((p) => p.version === 'v3').length
  const v4 = positions.length - v3
  if (v3 === 0 && v4 === 0) return ''
  if (v4 === 0) return `${v3} v3`
  if (v3 === 0) return `${v4} v4`
  return `${v3} v3 · ${v4} v4`
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

  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: 'Unclaimed fees', value: formatUsd(totalUsd) },
    {
      label: 'Positions with fees',
      value: String(withFees.length),
      sub: versionSplit(withFees),
    },
    {
      label: 'Positions found',
      value: String(positions.length),
      sub: versionSplit(positions),
    },
    { label: 'Chains', value: String(chainCount) },
  ]

  return (
    <div className="summary">
      {tiles.map((tile) => (
        <div key={tile.label}>
          <span className="summary__label">{tile.label}</span>
          <span className="summary__value">
            {tile.value}
            {tile.sub && <span className="summary__sub">{tile.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}
