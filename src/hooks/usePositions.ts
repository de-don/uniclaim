import { useCallback, useEffect, useRef, useState } from 'react'
import { getPublicClient } from 'wagmi/actions'
import type { PublicClient } from 'viem'
import { CHAINS, type ChainConfig } from '../config/chains'
import { V4_BY_CHAIN } from '../config/v4'
import { fetchPrices, positionUsd } from '../lib/prices'
import { scanChain } from '../lib/scan'
import { scanChainV4 } from '../lib/v4/scan'
import type { ChainScan, Position } from '../lib/types'
import { config } from '../wagmi'

/** How stale the numbers on screen may get before they are quietly re-read. */
export const AUTO_REFRESH_MS = 60_000

/** How often staleness is checked, so a tab coming back to the front catches up quickly. */
const TICK_MS = 10_000

function initialScans(): ChainScan[] {
  return CHAINS.map((c) => ({ chainId: c.chain.id, status: 'idle', positions: [], skipped: 0 }))
}

function clientFor(chainId: number): PublicClient | undefined {
  return getPublicClient(config, { chainId }) as PublicClient | undefined
}

/** v3 and v4 are independent lookups; one failing must not hide the other. */
function readChain(
  client: PublicClient,
  chainConfig: ChainConfig,
  owner: `0x${string}`,
  fresh: boolean,
) {
  const v4 = V4_BY_CHAIN.get(chainConfig.chain.id)
  return Promise.allSettled([
    scanChain(client, chainConfig, owner),
    v4
      ? scanChainV4(client, chainConfig, v4, owner, { fresh })
      : Promise.resolve([] as Position[]),
  ])
}

/**
 * Scans every supported chain in parallel and reports each one as it lands, so
 * the first results render while slower RPCs are still answering. After that
 * the numbers are re-read in the background every minute while the tab is in
 * front, without clearing what is already on screen.
 */
export function usePositions(owner: `0x${string}` | undefined, options: { paused?: boolean } = {}) {
  const [scans, setScans] = useState<ChainScan[]>(initialScans)
  const [isScanning, setIsScanning] = useState(false)
  const runId = useRef(0)
  /** Bumped to discard a background refresh whose results are already outdated. */
  const refreshId = useRef(0)
  const scanning = useRef(false)
  const refreshing = useRef(false)
  const lastReadAt = useRef(0)
  const paused = useRef(Boolean(options.paused))
  useEffect(() => {
    paused.current = Boolean(options.paused)
  }, [options.paused])

  const update = useCallback((chainId: number, patch: Partial<ChainScan>) => {
    setScans((prev) => prev.map((s) => (s.chainId === chainId ? { ...s, ...patch } : s)))
  }, [])

  /** `fresh` skips the v4 discovery cache; the Refresh button always does. */
  const scan = useCallback(async (fresh = false) => {
    if (!owner) return
    const currentRun = ++runId.current
    scanning.current = true
    lastReadAt.current = Date.now()
    setScans(
      CHAINS.map((c) => ({ chainId: c.chain.id, status: 'loading', positions: [], skipped: 0 })),
    )
    setIsScanning(true)

    await Promise.all(
      CHAINS.map(async (chainConfig) => {
        const chainId = chainConfig.chain.id
        const client = clientFor(chainId)
        if (!client) {
          update(chainId, { status: 'error', error: 'No RPC client for this chain', skipped: 0 })
          return
        }

        const [v3Result, v4Result] = await readChain(client, chainConfig, owner, fresh)
        if (runId.current !== currentRun) return

        const v4Positions = v4Result.status === 'fulfilled' ? v4Result.value : []
        const v4Error =
          v4Result.status === 'rejected' ? describe(v4Result.reason) : undefined

        const positions =
          v3Result.status === 'rejected'
            ? v4Positions
            : [...v3Result.value.positions, ...v4Positions]

        if (v3Result.status === 'rejected') {
          update(chainId, {
            status: v4Positions.length > 0 ? 'done' : 'error',
            error: describe(v3Result.reason),
            positions,
            skipped: 0,
            v4Error,
          })
        } else {
          update(chainId, {
            status: 'done',
            positions,
            skipped: v3Result.value.skipped,
            v4Error,
          })
        }

        // Priced per chain, as each one lands, so the USD total climbs alongside
        // the position counts instead of sitting at zero until the slowest RPC
        // answers.
        if (positions.length === 0) return
        const prices = await fetchPrices(positions)
        if (runId.current !== currentRun) return
        // Mapped over what is in state now, not `positions`: a claim made while
        // prices were loading has already removed some of them.
        setScans((prev) =>
          prev.map((s) =>
            s.chainId === chainId
              ? { ...s, positions: s.positions.map((p) => ({ ...p, usd: positionUsd(p, prices) })) }
              : s,
          ),
        )
      }),
    )

    if (runId.current !== currentRun) return
    scanning.current = false
    setIsScanning(false)
  }, [owner, update])

  /**
   * The background counterpart of `scan`: nothing is cleared up front, and a
   * chain is only replaced once it has been read in full and priced. A chain
   * that fails to answer keeps what it showed — a missed refresh is not worth
   * an error banner when the previous read is a minute old. The v4 explorer
   * answer comes from its cache, so it is asked at most every five minutes.
   */
  const refresh = useCallback(async () => {
    if (!owner || refreshing.current) return
    const currentRun = runId.current
    const currentRefresh = ++refreshId.current
    const outdated = () =>
      runId.current !== currentRun || refreshId.current !== currentRefresh
    refreshing.current = true
    lastReadAt.current = Date.now()

    try {
      await Promise.all(
        CHAINS.map(async (chainConfig) => {
          const chainId = chainConfig.chain.id
          const client = clientFor(chainId)
          if (!client) return

          const [v3Result, v4Result] = await readChain(client, chainConfig, owner, false)
          if (v3Result.status === 'rejected' || v4Result.status === 'rejected') return

          const positions = [...v3Result.value.positions, ...v4Result.value]
          const prices = positions.length > 0 ? await fetchPrices(positions) : new Map()
          if (outdated()) return

          setScans((prev) =>
            prev.map((s) => {
              if (s.chainId !== chainId) return s
              // A price lookup that failed this time should not blank a USD
              // figure the previous read had.
              const previousUsd = new Map(s.positions.map((p) => [p.key, p.usd]))
              return {
                ...s,
                status: 'done',
                error: undefined,
                v4Error: undefined,
                skipped: v3Result.value.skipped,
                positions: positions.map((p) => ({
                  ...p,
                  usd: positionUsd(p, prices) ?? previousUsd.get(p.key) ?? null,
                })),
              }
            }),
          )
        }),
      )
    } finally {
      if (refreshId.current === currentRefresh) refreshing.current = false
    }
  }, [owner])

  useEffect(() => {
    // Bumping the run id abandons any scan still in flight for a previous
    // address; a disconnected wallet needs no state reset because the returned
    // values are derived from `owner` below.
    runId.current++
    scanning.current = false
    refreshing.current = false
    if (!owner) return
    // Kicking off the scan flips every chain to "loading" synchronously. That is
    // the point: this effect exists to synchronize with an external system (the
    // RPCs), which is exactly the case the rule carves out.
    // oxlint-disable-next-line react/set-state-in-effect
    void scan()
  }, [owner, scan])

  useEffect(() => {
    if (!owner) return
    const id = setInterval(() => {
      // A hidden tab has nobody to show the numbers to, and a claim in flight
      // is about to change them anyway.
      if (document.hidden || paused.current || scanning.current) return
      if (Date.now() - lastReadAt.current < AUTO_REFRESH_MS) return
      void refresh()
    }, TICK_MS)
    return () => clearInterval(id)
  }, [owner, refresh])

  const removePositions = useCallback((keys: Set<string>) => {
    // A background read that started before the claim landed would bring the
    // claimed positions back, fees and all.
    refreshId.current++
    refreshing.current = false
    setScans((prev) =>
      prev.map((s) => ({ ...s, positions: s.positions.filter((p) => !keys.has(p.key)) })),
    )
  }, [])

  return {
    scans: owner ? scans : initialScans(),
    isScanning: owner ? isScanning : false,
    rescan: () => scan(true),
    removePositions,
  }
}

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
