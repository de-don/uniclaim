import { useState } from 'react'
import { CHAINS } from '../config/chains'
import type { Position } from '../lib/types'
import { ChainGroup } from './ChainGroup'

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
): Position {
  return {
    key: `v3-${chainId}-${tokenId}`,
    chainId,
    version: tokenId % 2n === 0n ? 'v4' : 'v3',
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

const MOCK: Record<number, Position[]> = {
  1: [
    mock(1, 612345n, USDC, WETH, 500, 1_284_120_000n, 402_119_338_201_991_100n, 2412.88, true),
    mock(1, 498211n, WBTC, WETH, 3000, 41_233n, 15_792_171_943_559_771n, 91.4, false),
  ],
  42161: [
    mock(42161, 3_112_004n, USDC, WETH, 500, 88_240_000n, 12_119_338_201_991_100n, 132.05, true),
  ],
}

export function Preview() {
  const [selected, setSelected] = useState<Set<string>>(new Set(['v3-1-498211']))

  return (
    <div className="main">
      {CHAINS.filter((c) => MOCK[c.chain.id]).map((config) => (
        <ChainGroup
          key={config.chain.id}
          config={config}
          positions={MOCK[config.chain.id]}
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
