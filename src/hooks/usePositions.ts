import { useCallback, useEffect, useRef, useState } from 'react'
import { getPublicClient } from 'wagmi/actions'
import type { PublicClient } from 'viem'
import { CHAINS } from '../config/chains'
import { fetchPrices, positionUsd } from '../lib/prices'
import { scanChain } from '../lib/scan'
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
        try {
          const client = getPublicClient(config, { chainId: chainConfig.chain.id })
          if (!client) throw new Error('No RPC client for this chain')
          const { positions, skipped } = await scanChain(client as PublicClient, chainConfig, owner)
          if (runId.current === currentRun) {
            update(chainConfig.chain.id, { status: 'done', positions, skipped })
          }
          return positions
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (runId.current === currentRun) {
            update(chainConfig.chain.id, { status: 'error', error: message, positions: [], skipped: 0 })
          }
          return [] as Position[]
        }
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
