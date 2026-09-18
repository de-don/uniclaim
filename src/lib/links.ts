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
