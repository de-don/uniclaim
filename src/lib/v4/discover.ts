import type { PublicClient } from 'viem'
import { v4PositionManagerAbi } from '../../abi/v4'
import type { V4Config } from '../../config/v4'
import { readAll } from '../multicall'

const PAGE_LIMIT = 8

/**
 * How long an explorer answer may be reused. Short on purpose: the cache can
 * only ever *omit* a position, never invent one — ids are still checked against
 * `ownerOf`, so a stale entry is discarded — but omitting a position someone
 * just minted is the one way this can mislead. Refresh bypasses it entirely.
 */
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_PREFIX = 'uniclaim.v4ids.'

type CacheEntry = { at: number; ids: string[] }

function cacheKey(chainId: number, owner: string) {
  return `${CACHE_PREFIX}${chainId}.${owner.toLowerCase()}`
}

function readCache(chainId: number, owner: string): bigint[] | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(chainId, owner))
    if (!raw) return undefined
    const entry = JSON.parse(raw) as CacheEntry
    if (Date.now() - entry.at > CACHE_TTL_MS) return undefined
    return entry.ids.map(BigInt)
  } catch {
    // Blocked or corrupt storage just means no cache; never a failure.
    return undefined
  }
}

function writeCache(chainId: number, owner: string, ids: bigint[]) {
  try {
    const entry: CacheEntry = { at: Date.now(), ids: ids.map(String) }
    localStorage.setItem(cacheKey(chainId, owner), JSON.stringify(entry))
  } catch {
    // Storage full or unavailable — the scan is unaffected.
  }
}

type NftItem = {
  id?: string
  token?: { address?: string; address_hash?: string }
}

type NftPage = {
  items?: NftItem[]
  next_page_params?: Record<string, string | number> | null
}

/**
 * Asks a public explorer which NFTs an address holds and keeps the ones minted
 * by the v4 position manager.
 *
 * The explorer is an untrusted hint, not a source of truth: whatever it returns
 * is only a list of numbers, and every number is then checked against `ownerOf`
 * on chain. A stale, wrong or hostile answer can at worst cost one extra read —
 * it cannot put someone else's position in front of the user, and it cannot
 * affect what a claim does.
 */
async function candidateIds(config: V4Config, owner: `0x${string}`): Promise<bigint[]> {
  const ids: bigint[] = []
  let query = 'type=ERC-721'

  for (let page = 0; page < PAGE_LIMIT; page++) {
    const response = await fetch(`${config.explorer}/api/v2/addresses/${owner}/nft?${query}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`explorer responded ${response.status}`)

    const data = (await response.json()) as NftPage
    for (const item of data.items ?? []) {
      const address = (item.token?.address ?? item.token?.address_hash ?? '').toLowerCase()
      if (address === config.positionManager.toLowerCase() && item.id) ids.push(BigInt(item.id))
    }

    if (!data.next_page_params) break
    query = new URLSearchParams({
      type: 'ERC-721',
      ...Object.fromEntries(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)])),
    }).toString()
  }

  return ids
}

/**
 * Explorer-suggested ids, filtered down to the ones the chain confirms are owned.
 *
 * `fresh` skips the cache; the Refresh button sets it, so there is always a way
 * to see a position minted in the last few minutes.
 */
export async function discoverV4TokenIds(
  client: PublicClient,
  config: V4Config,
  owner: `0x${string}`,
  options: { fresh?: boolean } = {},
): Promise<bigint[]> {
  const cached = options.fresh ? undefined : readCache(config.chainId, owner)
  const candidates = cached ?? (await candidateIds(config, owner))
  if (!cached) writeCache(config.chainId, owner, candidates)
  if (candidates.length === 0) return []

  const owners = await readAll(
    client,
    candidates.map((tokenId) => ({
      address: config.positionManager,
      abi: v4PositionManagerAbi,
      functionName: 'ownerOf' as const,
      args: [tokenId] as const,
    })),
    // A burned id reverts, which is an ordinary answer here rather than a fault.
    { label: 'v4 ownerOf', tolerateFailures: true },
  )

  return candidates.filter(
    (_, i) => (owners[i] as string | undefined)?.toLowerCase() === owner.toLowerCase(),
  )
}
