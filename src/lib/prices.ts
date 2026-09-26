import { formatUnits } from 'viem'
import { CHAIN_BY_ID } from '../config/chains'
import type { Position } from './types'

const LLAMA_URL = 'https://coins.llama.fi/prices/current'
const CHUNK_SIZE = 50

type LlamaResponse = {
  coins: Record<string, { price?: number; decimals?: number; symbol?: string }>
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * DefiLlama's price endpoint is keyed by `<chain>:<token address>` and needs no
 * API key, which keeps the app fully client-side. Prices are best-effort: a
 * missing quote leaves the position's USD value as null rather than showing 0.
 */
export async function fetchPrices(positions: Position[]): Promise<Map<string, number>> {
  const keys = new Set<string>()
  for (const position of positions) {
    const llamaKey = CHAIN_BY_ID.get(position.chainId)?.llamaKey
    if (!llamaKey) continue
    keys.add(`${llamaKey}:${position.token0.address}`)
    keys.add(`${llamaKey}:${position.token1.address}`)
  }

  const prices = new Map<string, number>()
  await Promise.all(
    chunk([...keys], CHUNK_SIZE).map(async (batch) => {
      try {
        const response = await fetch(`${LLAMA_URL}/${batch.join(',')}`)
        if (!response.ok) return
        const data = (await response.json()) as LlamaResponse
        for (const [key, value] of Object.entries(data.coins ?? {})) {
          if (typeof value.price === 'number') prices.set(key.toLowerCase(), value.price)
        }
      } catch {
        // Price data is decorative — a failed lookup must not break the scan.
      }
    }),
  )

  return prices
}

/** DefiLlama's CoinGecko-keyed ids for the gas tokens of the supported chains. */
const NATIVE_PRICE_IDS: Record<string, string> = {
  ETH: 'ethereum',
  POL: 'polygon-ecosystem-token',
  MATIC: 'matic-network',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
  CELO: 'celo',
}

/** USD price of a chain's gas token, by symbol; null when there is no quote. */
export async function fetchNativePrice(symbol: string): Promise<number | null> {
  const id = NATIVE_PRICE_IDS[symbol.toUpperCase()]
  if (!id) return null
  try {
    const response = await fetch(`${LLAMA_URL}/coingecko:${id}`)
    if (!response.ok) return null
    const data = (await response.json()) as LlamaResponse
    const price = data.coins?.[`coingecko:${id}`]?.price
    return typeof price === 'number' ? price : null
  } catch {
    return null
  }
}

export function priceKey(chainId: number, token: `0x${string}`): string {
  const llamaKey = CHAIN_BY_ID.get(chainId)?.llamaKey
  return llamaKey ? `${llamaKey}:${token}`.toLowerCase() : ''
}

export function positionUsd(position: Position, prices: Map<string, number>): number | null {
  const price0 = prices.get(priceKey(position.chainId, position.token0.address))
  const price1 = prices.get(priceKey(position.chainId, position.token1.address))
  if (price0 === undefined && price1 === undefined) return null

  const value0 = price0 ? Number(formatUnits(position.fees0, position.token0.decimals)) * price0 : 0
  const value1 = price1 ? Number(formatUnits(position.fees1, position.token1.decimals)) * price1 : 0
  return value0 + value1
}
