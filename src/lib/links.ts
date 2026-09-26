import { CHAIN_BY_ID } from '../config/chains'
import { V4_BY_CHAIN } from '../config/v4'
import type { Position } from './types'

/**
 * Where a position lives on the web. The Uniswap interface shows the position
 * itself — range, fees, the hook on v4 — which is far more useful than a token
 * page, so it wins wherever Uniswap has a page for the chain. Elsewhere the
 * block explorer's NFT instance page is the honest fallback.
 */
export function positionUrl(position: Position): string | undefined {
  const config = CHAIN_BY_ID.get(position.chainId)
  if (!config) return undefined

  if (config.uniswapSlug) {
    return `https://app.uniswap.org/positions/${position.version}/${config.uniswapSlug}/${position.tokenId}`
  }

  const explorer = config.chain.blockExplorers?.default.url
  if (!explorer) return undefined
  const manager =
    position.version === 'v4'
      ? V4_BY_CHAIN.get(position.chainId)?.positionManager
      : config.positionManager
  if (!manager) return undefined
  return `${explorer}/token/${manager}/instance/${position.tokenId}`
}

export function positionUrlLabel(position: Position): string {
  return CHAIN_BY_ID.get(position.chainId)?.uniswapSlug ? 'Open on Uniswap' : 'Open in block explorer'
}

export function hasFees(position: Position): boolean {
  return position.fees0 > 0n || position.fees1 > 0n
}

/**
 * Most valuable first: what a visitor came for should not sit below a page of
 * dust. Unpriced positions with fees rank under every priced one but above the
 * empty ones, and ties fall back to the newest position.
 */
export function byValue(a: Position, b: Position): number {
  const rank = (p: Position) => (!hasFees(p) ? -2 : p.usd === null ? -1 : p.usd)
  return rank(b) - rank(a) || (a.tokenId < b.tokenId ? 1 : a.tokenId > b.tokenId ? -1 : 0)
}

/** The priced part of the fees; unpriced positions add nothing rather than blank the sum. */
export function pricedUsd(positions: Position[]): number {
  return positions.reduce((sum, p) => sum + (hasFees(p) && p.usd !== null ? p.usd : 0), 0)
}
