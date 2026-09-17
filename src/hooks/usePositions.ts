import { useCallback, useEffect, useRef, useState } from 'react'
import { getPublicClient } from 'wagmi/actions'
import type { PublicClient } from 'viem'
import { CHAINS } from '../config/chains'
import { V4_BY_CHAIN } from '../config/v4'
import { fetchPrices, positionUsd } from '../lib/prices'
import { scanChain } from '../lib/scan'
import { scanChainV4 } from '../lib/v4/scan'
import type { ChainScan, Position } from '../lib/types'
import { config } from '../wagmi'

function initialScans(): ChainScan[] {
  return CHAINS.map((c) => ({ chainId: c.chain.id, status: 'idle', positions: [], skipped: 0 }))
}

/**
 * Scans every supported chain in parallel and reports each one as it lands, so
 * the first results render while slower RPCs are still answering.
 */
export function usePositions(owner: `0x${string}` | undefined) {
  const [scans, setScans] = useState<ChainScan[]>(initialScans)
  const [isScanning, setIsScanning] = useState(false)
  const runId = useRef(0)

  const update = useCallback((chainId: number, patch: Partial<ChainScan>) => {
    setScans((prev) => prev.map((s) => (s.chainId === chainId ? { ...s, ...patch } : s)))
  }, [])

  const scan = useCallback(async () => {
    if (!owner) return
    const currentRun = ++runId.current
    setScans(
      CHAINS.map((c) => ({ chainId: c.chain.id, status: 'loading', positions: [], skipped: 0 })),
    )
    setIsScanning(true)

    const all = await Promise.all(
      CHAINS.map(async (chainConfig) => {
        const chainId = chainConfig.chain.id
        const v4 = V4_BY_CHAIN.get(chainId)

        const client = getPublicClient(config, { chainId }) as PublicClient | undefined
        if (!client) {
          update(chainId, { status: 'error', error: 'No RPC client for this chain', skipped: 0 })
          return [] as Position[]
        }

        // v3 and v4 are independent lookups; one failing must not hide the other.
        const [v3Result, v4Result] = await Promise.allSettled([
          scanChain(client, chainConfig, owner),
          v4 ? scanChainV4(client, chainConfig, v4, owner) : Promise.resolve([] as Position[]),
        ])

        if (runId.current !== currentRun) return [] as Position[]

        const v4Positions = v4Result.status === 'fulfilled' ? v4Result.value : []
        const v4Error =
          v4Result.status === 'rejected' ? describe(v4Result.reason) : undefined

        if (v3Result.status === 'rejected') {
          update(chainId, {
            status: v4Positions.length > 0 ? 'done' : 'error',
            error: describe(v3Result.reason),
            positions: v4Positions,
            skipped: 0,
            v4Error,
          })
          return v4Positions
        }

        const positions = [...v3Result.value.positions, ...v4Positions]
        update(chainId, {
          status: 'done',
          positions,
          skipped: v3Result.value.skipped,
          v4Error,
        })
        return positions
      }),
    )

    if (runId.current !== currentRun) return
    setIsScanning(false)

    const flat = all.flat()
    if (flat.length === 0) return

    const prices = await fetchPrices(flat)
    if (runId.current !== currentRun) return
    setScans((prev) =>
      prev.map((s) => ({
        ...s,
        positions: s.positions.map((p) => ({ ...p, usd: positionUsd(p, prices) })),
      })),
    )
  }, [owner, update])

  useEffect(() => {
    // Bumping the run id abandons any scan still in flight for a previous
    // address; a disconnected wallet needs no state reset because the returned
    // values are derived from `owner` below.
    runId.current++
    if (!owner) return
    // Kicking off the scan flips every chain to "loading" synchronously. That is
    // the point: this effect exists to synchronize with an external system (the
    // RPCs), which is exactly the case the rule carves out.
    // oxlint-disable-next-line react/set-state-in-effect
    void scan()
  }, [owner, scan])

  const removePositions = useCallback((keys: Set<string>) => {
    setScans((prev) =>
      prev.map((s) => ({ ...s, positions: s.positions.filter((p) => !keys.has(p.key)) })),
    )
  }, [])

  return {
    scans: owner ? scans : initialScans(),
    isScanning: owner ? isScanning : false,
    rescan: scan,
    removePositions,
  }
}

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
