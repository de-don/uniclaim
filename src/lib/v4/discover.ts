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

/*
 * Positions added by pasting their link, for chains where nothing can list
 * them (and as a fallback anywhere a lookup misses one). Per-viewer
 * convenience only: kept in this browser, keyed by chain and owner, and every
 * id is still checked against `ownerOf` before it is shown.
 */
const MANUAL_PREFIX = 'uniclaim.v4manual.'

function manualKey(chainId: number, owner: string) {
  return `${MANUAL_PREFIX}${chainId}.${owner.toLowerCase()}`
}

function readManual(chainId: number, owner: string): bigint[] {
  try {
    const raw = localStorage.getItem(manualKey(chainId, owner))
    return raw ? (JSON.parse(raw) as string[]).map(BigInt) : []
  } catch {
    return []
  }
}

/** Remembers a pasted position so every later scan of this owner includes it. */
export function addManualV4Id(chainId: number, owner: string, tokenId: bigint) {
  const ids = new Set(readManual(chainId, owner).map(String))
  ids.add(String(tokenId))
  try {
    localStorage.setItem(manualKey(chainId, owner), JSON.stringify([...ids]))
  } catch {
    // Without storage the position is simply not remembered across reloads.
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

async function fromBlockscout(url: string, config: V4Config, owner: `0x${string}`) {
  const ids: bigint[] = []
  let query = 'type=ERC-721'

  for (let page = 0; page < PAGE_LIMIT; page++) {
    const response = await fetch(`${url}/api/v2/addresses/${owner}/nft?${query}`, {
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

type RoutescanResponse = {
  status?: string
  message?: string
  result?: { tokenID?: string; to?: string }[] | string | null
}

/**
 * Routescan speaks the etherscan API without a key. It lists transfers rather
 * than holdings, so every id ever sent to the owner is a candidate — the ones
 * since sent away are dropped by the `ownerOf` check like any other stale hint.
 */
async function fromRoutescan(config: V4Config, owner: `0x${string}`) {
  const query = new URLSearchParams({
    module: 'account',
    action: 'tokennfttx',
    address: owner,
    contractaddress: config.positionManager,
    page: '1',
    offset: '10000',
    sort: 'desc',
  })
  const response = await fetch(
    `https://api.routescan.io/v2/network/mainnet/evm/${config.chainId}/etherscan/api?${query}`,
    { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) },
  )
  if (!response.ok) throw new Error(`explorer responded ${response.status}`)

  const data = (await response.json()) as RoutescanResponse
  // The etherscan dialect reports "no transfers" as status 0 without a list.
  if (!Array.isArray(data.result)) {
    if (/no transactions found/i.test(data.message ?? '')) return []
    throw new Error(`explorer: ${data.message ?? 'unexpected answer'}`)
  }

  const ids = new Set<string>()
  for (const transfer of data.result) {
    if (transfer.to?.toLowerCase() === owner.toLowerCase() && transfer.tokenID) {
      ids.add(transfer.tokenID)
    }
  }
  return [...ids].map(BigInt)
}

/**
 * Asks a public explorer which v4 positions an address may hold.
 *
 * The explorer is an untrusted hint, not a source of truth: whatever it returns
 * is only a list of numbers, and every number is then checked against `ownerOf`
 * on chain. A stale, wrong or hostile answer can at worst cost one extra read —
 * it cannot put someone else's position in front of the user, and it cannot
 * affect what a claim does.
 */
async function candidateIds(config: V4Config, owner: `0x${string}`): Promise<bigint[]> {
  if (!config.discovery) return []
  return config.discovery.kind === 'blockscout'
    ? fromBlockscout(config.discovery.url, config, owner)
    : fromRoutescan(config, owner)
}

/**
 * Explorer-suggested and pasted ids, filtered down to the ones the chain
 * confirms are owned.
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
  const found = cached ?? (await candidateIds(config, owner))
  if (!cached && config.discovery) writeCache(config.chainId, owner, found)

  const candidates = [
    ...new Map(
      [...found, ...readManual(config.chainId, owner)].map((id) => [String(id), id]),
    ).values(),
  ]
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
