import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ChainGroup } from './components/ChainGroup'
import { InfoPanel, type InfoTab } from './components/InfoPanel'
import { Landing } from './components/Landing'
import { Summary } from './components/Summary'
import { CHAIN_BY_ID, CHAINS } from './config/chains'
import { REPO_URL, SECURITY_URL } from './config/links'
import { V4_CHAINS } from './config/v4'
import { useClaim } from './hooks/useClaim'
import { usePositions } from './hooks/usePositions'
import { byValue, hasFees, pricedUsd } from './lib/links'
import { MAX_POSITIONS } from './lib/scan'
import type { Position } from './lib/types'

const MENU: { id: InfoTab; label: string }[] = [
  { id: 'how', label: 'How it works' },
  { id: 'security', label: 'Security' },
  { id: 'faq', label: 'FAQ' },
]

const HIDE_EMPTY_KEY = 'uniclaim.hideEmpty'

/** Per-viewer convenience only, so a blocked or empty store is not a problem. */
function readHideEmpty(): boolean {
  try {
    return localStorage.getItem(HIDE_EMPTY_KEY) !== 'false'
  } catch {
    return true
  }
}

export default function App() {
  const { address, isConnected } = useAccount()
  const { claim, state: claimState } = useClaim()
  const { scans, isScanning, rescan, removePositions } = usePositions(address, {
    paused: ['switching', 'signing', 'pending'].includes(claimState.status),
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [infoTab, setInfoTab] = useState<InfoTab | null>(null)
  const [hideEmpty, setHideEmpty] = useState(readHideEmpty)

  useEffect(() => {
    try {
      localStorage.setItem(HIDE_EMPTY_KEY, String(hideEmpty))
    } catch {
      // A viewer with site data blocked simply does not get the preference kept.
    }
  }, [hideEmpty])

  const allPositions = useMemo(() => scans.flatMap((s) => s.positions), [scans])
  const feePositions = useMemo(() => allPositions.filter(hasFees), [allPositions])
  const emptyCount = allPositions.length - feePositions.length

  const groups = useMemo(
    () =>
      CHAINS.map((config) => {
        const scan = scans.find((s) => s.chainId === config.chain.id)
        const positions = [...(scan?.positions ?? [])].sort(byValue)
        return { config, visible: hideEmpty ? positions.filter(hasFees) : positions }
      })
        .filter((g) => g.visible.length > 0)
        // Richest chain first; the stable sort keeps config order among equals.
        .sort((a, b) => pricedUsd(b.visible) - pricedUsd(a.visible)),
    [scans, hideEmpty],
  )

  const selectedPositions = useMemo(
    () => feePositions.filter((p) => selected.has(p.key)),
    [feePositions, selected],
  )

  const failedChains = scans.filter((s) => s.status === 'error')
  const truncated = scans.filter((s) => s.skipped > 0)
  const v4Failed = scans.filter((s) => s.v4Error)
  const v4ChainNames = V4_CHAINS.map((v) => CHAIN_BY_ID.get(v.chainId)?.chain.name).filter(Boolean)

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
      // Only positions that would actually pay out are selectable.
      const keys = feePositions.filter((p) => p.chainId === chainId).map((p) => p.key)
      setSelected((prev) => {
        const next = new Set(prev)
        for (const key of keys) {
          if (on) next.add(key)
          else next.delete(key)
        }
        return next
      })
    },
    [feePositions],
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
          <a
            className="menu__item menu__item--source"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
          >
            Source
            <span aria-hidden="true"> ↗</span>
          </a>
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
          {/* No chain switcher: every chain is scanned regardless of which one
              the wallet is on, and claiming switches to the right one itself.
              Offering the control would imply it changes what you see. */}
          <ConnectButton showBalance={false} chainStatus="none" />
        </div>
      </header>

      <main className="main">
        {!isConnected ? (
          <Landing onOpenInfo={setInfoTab} />
        ) : (
          <>
            <Summary positions={allPositions} chainCount={groups.length} />

            {allPositions.length > 0 && (
              <div className="filters">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={hideEmpty}
                    onChange={(e) => setHideEmpty(e.target.checked)}
                  />
                  Hide positions with no fees
                  {emptyCount > 0 && ` (${emptyCount})`}
                </label>
              </div>
            )}

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

            {v4Failed.length > 0 && (
              <div className="banner banner--warn">
                v4 lookup unavailable on{' '}
                {v4Failed.map((s) => CHAIN_BY_ID.get(s.chainId)?.chain.name).join(', ')} — the
                explorer that lists v4 positions did not answer. v3 results below are unaffected.
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
                <h2>{allPositions.length > 0 ? 'Nothing to claim' : 'No positions found'}</h2>
                <p>
                  {allPositions.length > 0
                    ? `Found ${allPositions.length} position${allPositions.length === 1 ? '' : 's'}, none with fees waiting. Untick the filter above to see them.`
                    : 'This address holds no Uniswap v3 or v4 position on a supported chain.'}
                </p>
              </div>
            )}

            {groups.map(({ config, visible }) => (
              <ChainGroup
                key={config.chain.id}
                config={config}
                positions={visible}
                selected={selected}
                onToggle={toggle}
                onToggleChain={toggleChain}
                onClaim={(chainId, positions) => void runClaim(chainId, positions)}
                claimState={claimState}
              />
            ))}

            {!isScanning && (
              <p className="footnote">
                v4 positions are scanned on {v4ChainNames.join(', ')}. Everywhere else only v3
                exists in a form this app can enumerate — see{' '}
                <button className="link" onClick={() => setInfoTab('faq')}>
                  the FAQ
                </button>
                .
              </p>
            )}
          </>
        )}
      </main>

      <footer className="sitefoot">
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source
        </a>
        {__COMMIT_SHA__ && (
          <a
            href={`${REPO_URL}/commit/${__COMMIT_SHA__}`}
            target="_blank"
            rel="noreferrer"
            title="The commit this page was built from"
          >
            Build <code>{__COMMIT_SHA__.slice(0, 7)}</code>
          </a>
        )}
        <a href={SECURITY_URL} target="_blank" rel="noreferrer">
          Report a vulnerability
        </a>
        <span>No contracts of its own · no approvals · no backend</span>
      </footer>

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

      {infoTab && <InfoPanel tab={infoTab} onTab={setInfoTab} onClose={() => setInfoTab(null)} />}
    </div>
  )
}
