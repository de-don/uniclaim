import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useCallback, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ChainGroup } from './components/ChainGroup'
import { InfoPanel, type InfoTab } from './components/InfoPanel'
import { Landing } from './components/Landing'
import { CHAIN_BY_ID, CHAINS } from './config/chains'
import { useClaim } from './hooks/useClaim'
import { usePositions } from './hooks/usePositions'
import { formatUsd } from './lib/format'
import { MAX_POSITIONS } from './lib/scan'
import type { Position } from './lib/types'

const MENU: { id: InfoTab; label: string }[] = [
  { id: 'how', label: 'How it works' },
  { id: 'security', label: 'Security' },
  { id: 'faq', label: 'FAQ' },
]

export default function App() {
  const { address, isConnected } = useAccount()
  const { scans, isScanning, rescan, removePositions } = usePositions(address)
  const { claim, state: claimState } = useClaim()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [infoTab, setInfoTab] = useState<InfoTab | null>(null)

  const groups = useMemo(
    () =>
      CHAINS.map((config) => ({
        config,
        scan: scans.find((s) => s.chainId === config.chain.id),
      })).filter((g) => (g.scan?.positions.length ?? 0) > 0),
    [scans],
  )

  const allPositions = useMemo(() => scans.flatMap((s) => s.positions), [scans])
  const selectedPositions = useMemo(
    () => allPositions.filter((p) => selected.has(p.key)),
    [allPositions, selected],
  )

  const totalUsd = useMemo(
    () =>
      allPositions.reduce<number | null>(
        (sum, p) => (p.usd === null || sum === null ? sum : sum + p.usd),
        0,
      ),
    [allPositions],
  )

  const failedChains = scans.filter((s) => s.status === 'error')
  const truncated = scans.filter((s) => s.skipped > 0)
  const v4Count = allPositions.filter((p) => p.version === 'v4').length

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleChain = useCallback(
    (chainId: number, on: boolean) => {
      const keys = allPositions.filter((p) => p.chainId === chainId).map((p) => p.key)
      setSelected((prev) => {
        const next = new Set(prev)
        for (const key of keys) {
          if (on) next.add(key)
          else next.delete(key)
        }
        return next
      })
    },
    [allPositions],
  )

  const runClaim = useCallback(
    async (chainId: number, positions: Position[]) => {
      const claimed = await claim(chainId, positions)
      if (claimed.length === 0) return
      const keys = new Set(claimed.map((p) => p.key))
      removePositions(keys)
      setSelected((prev) => new Set([...prev].filter((k) => !keys.has(k))))
    },
    [claim, removePositions],
  )

  /** A selection can span chains, and each chain still needs its own transaction. */
  const claimSelectedEverywhere = useCallback(async () => {
    const byChain = new Map<number, Position[]>()
    for (const position of selectedPositions) {
      byChain.set(position.chainId, [...(byChain.get(position.chainId) ?? []), position])
    }
    for (const [chainId, positions] of byChain) {
      await runClaim(chainId, positions)
    }
  }, [runClaim, selectedPositions])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">◎</span>
          <span className="brand__name">UniClaim</span>
        </div>

        <nav className="menu">
          {MENU.map((item) => (
            <button key={item.id} className="menu__item" onClick={() => setInfoTab(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        {/* The full menu does not fit a phone; the panel's own tabs take over from here. */}
        <button className="menu__compact" onClick={() => setInfoTab('how')} aria-label="About">
          Info
        </button>

        <div className="topbar__right">
          {isConnected && (
            <button className="btn btn--ghost" onClick={() => void rescan()} disabled={isScanning}>
              {isScanning ? 'Scanning…' : 'Refresh'}
            </button>
          )}
          <ConnectButton showBalance={false} />
        </div>
      </header>

      <main className="main">
        {!isConnected ? (
          <Landing onOpenInfo={setInfoTab} />
        ) : (
          <>
            <div className="summary">
              <div>
                <span className="summary__label">Unclaimed fees</span>
                <span className="summary__value">{formatUsd(totalUsd)}</span>
              </div>
              <div>
                <span className="summary__label">Positions with fees</span>
                <span className="summary__value">
                  {allPositions.length}
                  {v4Count > 0 && <span className="summary__sub">{v4Count} on v4</span>}
                </span>
              </div>
              <div>
                <span className="summary__label">Chains</span>
                <span className="summary__value">{groups.length}</span>
              </div>
            </div>

            {isScanning && (
              <div className="scanbar">
                <div className="scanbar__fill" />
                <span>Scanning {CHAINS.length} chains — results appear as each node replies</span>
              </div>
            )}

            {truncated.length > 0 && (
              <div className="banner banner--error">
                {truncated.map((s) => CHAIN_BY_ID.get(s.chainId)?.chain.name).join(', ')}: this
                wallet holds more than {MAX_POSITIONS} positions, so only the first {MAX_POSITIONS}{' '}
                were scanned. Set your own RPC endpoint to lift the limit.
              </div>
            )}

            {failedChains.length > 0 && (
              <div className="banner banner--error">
                Could not read{' '}
                {failedChains
                  .map((s) => CHAIN_BY_ID.get(s.chainId)?.chain.name ?? s.chainId)
                  .join(', ')}
                . That is usually a public RPC rate limit — hit Refresh, or set your own endpoint.
              </div>
            )}

            {!isScanning && groups.length === 0 && failedChains.length === 0 && (
              <div className="empty">
                <h2>Nothing to claim</h2>
                <p>
                  No Uniswap position on a supported chain has fees waiting. Positions with a zero
                  balance are hidden.
                </p>
              </div>
            )}

            {groups.map(({ config, scan }) => (
              <ChainGroup
                key={config.chain.id}
                config={config}
                positions={scan!.positions}
                selected={selected}
                onToggle={toggle}
                onToggleChain={toggleChain}
                onClaim={(chainId, positions) => void runClaim(chainId, positions)}
                claimState={claimState}
              />
            ))}
          </>
        )}
      </main>

      {selectedPositions.length > 0 && (
        <footer className="actionbar">
          <span>
            {selectedPositions.length} selected across{' '}
            {new Set(selectedPositions.map((p) => p.chainId)).size} chains
          </span>
          <button className="btn btn--primary" onClick={() => void claimSelectedEverywhere()}>
            Claim selected
          </button>
        </footer>
      )}

      {infoTab && (
        <InfoPanel tab={infoTab} onTab={setInfoTab} onClose={() => setInfoTab(null)} />
      )}
    </div>
  )
}
