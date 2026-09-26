import { useState } from 'react'
import { CHAIN_BY_ID, CHAINS } from '../config/chains'
import { V4_BY_CHAIN } from '../config/v4'
import { byValue, hasFees, pricedUsd } from '../lib/links'
import { sumByToken, type ChainReview } from '../lib/review'
import type { Position } from '../lib/types'
import { ChainGroup } from './ChainGroup'
import { ClaimReceipt } from './ClaimReceipt'
import { ClaimReviewPanel } from './ClaimReview'
import { Summary } from './Summary'

/**
 * Dev-only harness (open `#preview`) for eyeballing the connected-state layout
 * without a funded wallet on nine chains.
 */
const token = (symbol: string, decimals: number, address: string) => ({
  symbol,
  decimals,
  address: address as `0x${string}`,
})

function mock(
  chainId: number,
  tokenId: bigint,
  a: ReturnType<typeof token>,
  b: ReturnType<typeof token>,
  fee: number,
  fees0: bigint,
  fees1: bigint,
  usd: number | null,
  inRange: boolean,
  version: Position['version'] = 'v3',
  hooks?: `0x${string}`,
): Position {
  return {
    key: `${version}-${chainId}-${tokenId}`,
    chainId,
    version,
    hooks,
    tokenId,
    pool: '0x0000000000000000000000000000000000000001',
    fee,
    tickLower: -1000,
    tickUpper: 1000,
    tickCurrent: inRange ? 0 : 5000,
    liquidity: 10n ** 18n,
    inRange,
    token0: a,
    token1: b,
    fees0,
    fees1,
    usd,
  }
}

const WETH = token('WETH', 18, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')
const USDC = token('USDC', 6, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
const WBTC = token('WBTC', 8, '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599')
const ETH = token('ETH', 18, '0x0000000000000000000000000000000000000000')

const MOCK: Record<number, Position[]> = {
  1: [
    mock(1, 612345n, USDC, WETH, 500, 1_284_120_000n, 402_119_338_201_991_100n, 2412.88, true),
    mock(1, 498211n, WBTC, WETH, 3000, 41_233n, 15_792_171_943_559_771n, 91.4, false),
  ],
  42161: [
    mock(42161, 3_112_004n, USDC, WETH, 500, 88_240_000n, 12_119_338_201_991_100n, 132.05, true),
    // Nothing accrued yet — shown greyed out, and excluded from every action.
    mock(42161, 3_400_112n, WBTC, USDC, 500, 0n, 0n, null, false),
    // Claimable, but dust: counted in "found", not in "≥ $0.01".
    mock(42161, 3_400_998n, USDC, WETH, 3000, 2_100n, 1_400_000_000n, 0.004, true),
    mock(
      42161,
      208_173n,
      ETH,
      USDC,
      3000,
      9_140_338_201_991_100n,
      431_915n,
      23.04,
      true,
      'v4',
      '0x0000000000000000000000000000000000000000',
    ),
  ],
  10: [
    mock(
      10,
      28_952n,
      ETH,
      USDC,
      500,
      317_000_000_000_000n,
      1_230_795n,
      2.01,
      false,
      'v4',
      '0x3Fa9dAe3C4B1d2A1eF4c3C1bD9Ee1e3C9Ba8C088',
    ),
  ],
}

/** An address that is plainly a placeholder, so a screenshot never shows a real wallet. */
const OWNER = '0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4' as const

function mockReview(chainId: number, positions: Position[], gasWei: bigint, gasUsd: number): ChainReview {
  const v3 = positions.filter((p) => p.version === 'v3')
  const v4 = positions.filter((p) => p.version === 'v4')
  const txs = [
    ...(v3.length
      ? [{
          version: 'v3' as const,
          contract: CHAIN_BY_ID.get(chainId)!.positionManager,
          method: `multicall → collect × ${v3.length}`,
          positions: v3.length,
        }]
      : []),
    ...(v4.length
      ? [{
          version: 'v4' as const,
          contract: V4_BY_CHAIN.get(chainId)!.positionManager,
          method: `modifyLiquidities → ${v4.length} position${v4.length === 1 ? '' : 's'}`,
          positions: v4.length,
        }]
      : []),
  ]
  return {
    chainId,
    positions,
    txs,
    receive: sumByToken(positions),
    simulation: 'ok',
    amountsFromChain: v4.length === 0,
    receiveUsd: pricedUsd(positions),
    unpriced: positions.filter((p) => p.usd === null).length,
    gas: { native: gasWei, symbol: 'ETH', decimals: 18, usd: gasUsd },
  }
}

export type PreviewVariant = 'list' | 'receipts' | 'review'

/**
 * `#preview` shows the list, `#preview-receipts` adds one receipt of each
 * outcome, `#preview-review` opens the review panel on fixed data. Separate
 * addresses rather than toggles, so a screenshot carries no harness controls.
 */
export function Preview({ variant = 'list' }: { variant?: PreviewVariant }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(['v3-1-498211']))
  const [hideEmpty, setHideEmpty] = useState(false)

  const all = Object.values(MOCK).flat()
  const emptyCount = all.length - all.filter(hasFees).length

  const reviewSelection = [
    { chainId: 1, positions: MOCK[1] },
    { chainId: 42161, positions: MOCK[42161].filter(hasFees) },
  ]
  const reviews = new Map([
    [1, mockReview(1, reviewSelection[0].positions, 2_140_000_000_000_000n, 5.61)],
    [42161, mockReview(42161, reviewSelection[1].positions, 41_000_000_000_000n, 0.11)],
  ])

  return (
    <div className="main">
      {variant === 'review' && (
        <ClaimReviewPanel
          owner={OWNER}
          selection={reviewSelection}
          reviews={reviews}
          onConfirm={() => undefined}
          onClose={() => undefined}
        />
      )}

      {variant === 'receipts' && (
        <>
          <ClaimReceipt
            result={{
              chainId: 1,
              outcome: 'success',
              claimed: MOCK[1],
              hashes: ['0x6c3f2b9a1d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8'],
            }}
            onDismiss={() => undefined}
          />
          <ClaimReceipt
            result={{ chainId: 8453, outcome: 'cancelled', claimed: [], hashes: [] }}
            onDismiss={() => undefined}
          />
          <ClaimReceipt
            result={{
              chainId: 42161,
              outcome: 'error',
              claimed: [],
              hashes: [],
              error: 'The transaction reverted on chain',
            }}
            onDismiss={() => undefined}
          />
        </>
      )}

      <Summary positions={all} chainCount={Object.keys(MOCK).length} />

      <div className="filters">
        <label className="switch">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
          Hide positions with no fees
          {emptyCount > 0 && ` (${emptyCount})`}
        </label>
      </div>

      {CHAINS.filter((c) => MOCK[c.chain.id]).map((config) => (
        <ChainGroup
          key={config.chain.id}
          config={config}
          positions={[...MOCK[config.chain.id]]
            .sort(byValue)
            .filter((p) => !hideEmpty || hasFees(p))}
          selected={selected}
          onToggle={(key) =>
            setSelected((prev) => {
              const next = new Set(prev)
              if (next.has(key)) next.delete(key)
              else next.add(key)
              return next
            })
          }
          onToggleChain={(chainId, on) =>
            setSelected((prev) => {
              const next = new Set(prev)
              for (const p of MOCK[chainId]) {
                if (on) next.add(p.key)
                else next.delete(p.key)
              }
              return next
            })
          }
          onClaim={() => undefined}
          claimState={{ chainId: null, status: 'idle' }}
        />
      ))}
    </div>
  )
}
