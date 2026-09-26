import { useCallback, useEffect, useState } from 'react'
import { getAddress, isAddress, type PublicClient } from 'viem'
import { normalize } from 'viem/ens'
import { getPublicClient } from 'wagmi/actions'
import { mainnet } from 'wagmi/chains'
import { config } from '../wagmi'

/**
 * Kept in the fragment, not the query string: a fragment never leaves the
 * browser, so a shared link does not put the address in any server log.
 */
const PREFIX = '#address='

function readHash(): string {
  const hash = window.location.hash
  if (!hash.startsWith(PREFIX)) return ''
  try {
    return decodeURIComponent(hash.slice(PREFIX.length)).trim()
  } catch {
    return ''
  }
}

async function resolveEns(name: string): Promise<`0x${string}`> {
  const client = getPublicClient(config, { chainId: mainnet.id }) as PublicClient | undefined
  if (!client) throw new Error('No Ethereum RPC to resolve ENS names with')
  let normalized: string
  try {
    normalized = normalize(name)
  } catch {
    throw new Error('That is not a valid ENS name')
  }
  const address = await client.getEnsAddress({ name: normalized })
  if (!address) throw new Error(`${name} does not point to an address`)
  return address
}

export type WatchStatus = 'idle' | 'resolving' | 'ready' | 'error'

/**
 * An address to look at without connecting a wallet: the way to see what the
 * app finds before trusting it with a connection, and a link that can be
 * shared. Reading is all it allows — a claim still has to come from the owner.
 */
export function useWatchedAddress() {
  const [query, setQuery] = useState(readHash)
  const [resolved, setResolved] = useState<{
    query: string
    address?: `0x${string}`
    error?: string
  }>()

  useEffect(() => {
    const onHashChange = () => setQuery(readHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const direct = query && isAddress(query, { strict: false }) ? getAddress(query) : undefined
  const looksLikeName = !direct && query.includes('.')

  useEffect(() => {
    if (!looksLikeName) return
    let cancelled = false
    resolveEns(query).then(
      (address) => !cancelled && setResolved({ query, address }),
      (error: unknown) =>
        !cancelled &&
        setResolved({ query, error: error instanceof Error ? error.message : String(error) }),
    )
    return () => {
      cancelled = true
    }
  }, [query, looksLikeName])

  const fromEns = looksLikeName && resolved?.query === query ? resolved : undefined
  const address = direct ?? fromEns?.address

  let status: WatchStatus = 'idle'
  let error: string | undefined
  if (!query) status = 'idle'
  else if (address) status = 'ready'
  else if (!direct && !looksLikeName) {
    status = 'error'
    error = 'Enter a 0x address or an ENS name'
  } else if (fromEns?.error) {
    status = 'error'
    error = fromEns.error
  } else status = 'resolving'

  /** Setting the fragment adds a history entry, so Back leaves the lookup. */
  const watch = useCallback((raw: string) => {
    const value = raw.trim()
    if (!value) return
    window.location.hash = `${PREFIX}${encodeURIComponent(value)}`
  }, [])

  const clear = useCallback(() => {
    if (window.location.hash.startsWith(PREFIX)) {
      history.pushState(null, '', window.location.pathname + window.location.search)
    }
    setQuery('')
  }, [])

  return {
    /** What was typed or linked: an address, or the ENS name worth showing back. */
    query,
    address,
    /** The ENS name, when the lookup came from one. */
    name: looksLikeName ? query : undefined,
    status,
    error,
    watch,
    clear,
  }
}
