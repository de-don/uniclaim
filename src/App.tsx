import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useAccountEffect } from 'wagmi'
import { AddPosition } from './components/AddPosition'
import { ChainGroup } from './components/ChainGroup'
import { ClaimReceipt } from './components/ClaimReceipt'
import { ClaimReview, type ClaimSelection } from './components/ClaimReview'
import { InfoPanel, type InfoTab } from './components/InfoPanel'
import { Landing } from './components/Landing'
import { Summary } from './components/Summary'
import { CHAIN_BY_ID, CHAINS } from './config/chains'
import { REPO_URL, SECURITY_URL } from './config/links'
import { V4_CHAINS } from './config/v4'
import { useClaim, type ClaimResult } from './hooks/useClaim'
import { usePositions } from './hooks/usePositions'
import { useWatchedAddress } from './hooks/useWatchedAddress'
import { shortAddress } from './lib/format'
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
  const { address } = useAccount()
  const watched = useWatchedAddress()
  // Connecting is a request to act as that wallet, so it ends any lookup.
  useAccountEffect({ onConnect: ({ isReconnected }) => !isReconnected && watched.clear() })
  // While a lookup is resolving or has failed, falling back to the connected
  // wallet would quietly show the wrong address's positions under the name
  // that was asked for; the landing page shows the lookup's state instead.
  const owner = watched.query ? watched.address : address
  // Claims pay out to the position's owner and only the owner may send them,
  // so a looked-up address other than the connected one is view-only.
  const readOnly = Boolean(owner) && owner?.toLowerCase() !== address?.toLowerCase()
  const { claim, state: claimState } = useClaim()
  const { scans, isScanning, rescan, removePositions } = usePositions(owner, {
    paused: ['switching', 'signing', 'pending'].includes(claimState.status),
  })
  // A selection belongs to the address it was made for; looking at another one
  // starts empty rather than showing ticks carried over from elsewhere.
  const [selection, setSelection] = useState<{ owner?: string; keys: Set<string> }>({
    keys: new Set(),
  })
  const selected = useMemo(
    () => (selection.owner === owner ? selection.keys : new Set<string>()),
    [selection, owner],
  )
  const setSelected = useCallback(
    (update: (prev: Set<string>) => Set<string>) =>
      setSelection((prev) => ({
        owner,
        keys: update(prev.owner === owner ? prev.keys : new Set()),
      })),
    [owner],
  )
  const [infoTab, setInfoTab] = useState<InfoTab | null>(null)
  const [hideEmpty, setHideEmpty] = useState(readHideEmpty)
  const [copied, setCopied] = useState(false)
  /** Tied to the owner it was opened for, so switching address cannot leave it simulating someone else's positions. */
  const [review, setReview] = useState<{ owner: string; selection: ClaimSelection } | null>(null)
  /** Progress through a claim that spans several chains, one wallet prompt each. */
  const [sweep, setSweep] = useState<{ chains: number[]; index: number } | null>(null)
  /** The outcome of each chain's latest claim, kept above the list until dismissed. */
  const [receipts, setReceipts] = useState<ClaimResult[]>([])

  const copyLink = useCallback(async () => {
    if (!owner) return
    const target = watched.name ?? owner
    const link = `${window.location.origin}${window.location.pathname}#address=${encodeURIComponent(target)}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the address bar already holds the same link.
    }
  }, [owner, watched.name])

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
  const v4ChainNames = V4_CHAINS.filter((v) => v.discovery)
    .map((v) => CHAIN_BY_ID.get(v.chainId)?.chain.name)
    .filter(Boolean)
  const v4LinkOnlyNames = V4_CHAINS.filter((v) => !v.discovery)
    .map((v) => CHAIN_BY_ID.get(v.chainId)?.chain.name)
    .filter(Boolean)

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [setSelected])

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
    [feePositions, setSelected],
  )

  /** Every Claim button lands here: nothing reaches the wallet before the review. */
  const claimBusy = sweep !== null || ['switching', 'signing', 'pending'].includes(claimState.status)

  const requestClaim = useCallback(
    (chainId: number, positions: Position[]) => {
      if (!claimBusy && owner) setReview({ owner, selection: [{ chainId, positions }] })
    },
    [claimBusy, owner],
  )

  /** A selection can span chains, and each chain still needs its own transaction. */
  const requestClaimSelected = useCallback(() => {
    if (claimBusy || !owner) return
    const byChain = new Map<number, Position[]>()
    for (const position of selectedPositions) {
      byChain.set(position.chainId, [...(byChain.get(position.chainId) ?? []), position])
    }
    // In the order the chains are listed on the page, richest first.
    const order = groups.map((g) => g.config.chain.id)
    setReview({
      owner,
      selection: [...byChain]
        .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
        .map(([chainId, positions]) => ({ chainId, positions })),
    })
  }, [claimBusy, groups, owner, selectedPositions])

  const runSelection = useCallback(
    async (selection: ClaimSelection) => {
      const chains = selection.map((s) => s.chainId)
      for (const [index, { chainId, positions }] of selection.entries()) {
        if (chains.length > 1) setSweep({ chains, index })
        const result = await claim(chainId, positions)
        setReceipts((prev) => [result, ...prev.filter((r) => r.chainId !== chainId)])
        if (result.claimed.length > 0) {
          const keys = new Set(result.claimed.map((p) => p.key))
          removePositions(keys)
          setSelected((prev) => new Set([...prev].filter((k) => !keys.has(k))))
        }
      }
      setSweep(null)
    },
    [claim, removePositions, setSelected],
  )

  const confirmReview = useCallback(() => {
    if (!review || review.owner !== owner) return
    setReview(null)
    void runSelection(review.selection)
  }, [owner, review, runSelection])

  const closeReview = useCallback(() => setReview(null), [])

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
          {owner && (
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
        {!owner ? (
          <Landing
            onOpenInfo={setInfoTab}
            onLookup={watched.watch}
            lookupStatus={watched.status}
            lookupError={watched.error}
            lookupQuery={watched.query}
          />
        ) : (
          <>
            {readOnly && owner && (
              <div className="banner banner--watch">
                <span>
                  Viewing{' '}
                  <strong title={owner}>
                    {watched.name ? `${watched.name} (${shortAddress(owner)})` : shortAddress(owner)}
                  </strong>{' '}
                  read-only.{' '}
                  {address
                    ? 'Your connected wallet is a different address, so claiming is off here.'
                    : 'Connect this wallet to claim.'}
                </span>
                <span className="banner__actions">
                  <button className="link" onClick={() => void copyLink()}>
                    {copied ? 'Link copied' : 'Copy link'}
                  </button>
                  <button className="link" onClick={watched.clear}>
                    {address ? 'Back to my wallet' : 'Stop viewing'}
                  </button>
                </span>
              </div>
            )}

            {receipts.map((receipt) => (
              <ClaimReceipt
                key={receipt.chainId}
                result={receipt}
                onDismiss={() =>
                  setReceipts((prev) => prev.filter((r) => r.chainId !== receipt.chainId))
                }
              />
            ))}

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
                <span>
                  Scanning {CHAINS.length} chains — {scans.filter((s) => s.status !== 'loading').length}{' '}
                  answered so far
                </span>
                {/* Each chain reported as it answers: "we checked Base" is worth
                    seeing, and so is the one node that is still thinking. */}
                <div className="chips">
                  {CHAINS.map((config) => {
                    const scan = scans.find((s) => s.chainId === config.chain.id)
                    const count = scan?.positions.length ?? 0
                    const state =
                      !scan || scan.status === 'loading' || scan.status === 'idle'
                        ? 'loading'
                        : scan.status === 'error'
                          ? 'error'
                          : count > 0
                            ? 'found'
                            : 'empty'
                    return (
                      <span
                        key={config.chain.id}
                        className={`chip chip--${state}`}
                        title={state === 'error' ? scan?.error : undefined}
                      >
                        <span className="chip__dot" style={{ background: config.color }} />
                        {config.chain.name}
                        {state === 'found' && ` · ${count}`}
                        {state === 'empty' && ' · none'}
                        {state === 'error' && ' · failed'}
                      </span>
                    )
                  })}
                </div>
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
                onClaim={requestClaim}
                claimState={claimState}
                readOnly={readOnly}
              />
            ))}

            {!isScanning && (
              <p className="footnote">
                v4 positions are found automatically on {v4ChainNames.join(', ')}.
                {v4LinkOnlyNames.length > 0 &&
                  ` On ${v4LinkOnlyNames.join(', ')} nothing lists them without an API key, so add yours by link below.`}{' '}
                More in{' '}
                <button className="link" onClick={() => setInfoTab('faq')}>
                  the FAQ
                </button>
                .
              </p>
            )}
            {/* Outside the scanning condition: adding a position starts a scan,
                and unmounting here would swallow the confirmation. */}
            {owner && <AddPosition owner={owner} onAdded={() => void rescan()} />}
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
        <span className="sitefoot__claims">No contracts of its own · no approvals · no backend</span>
      </footer>

      {sweep ? (
        <footer className="actionbar">
          <span>
            Chain {sweep.index + 1} of {sweep.chains.length} ·{' '}
            <strong>{CHAIN_BY_ID.get(sweep.chains[sweep.index])?.chain.name}</strong> —{' '}
            {claimState.status === 'switching' && 'switch network in your wallet'}
            {claimState.status === 'signing' && 'confirm in your wallet'}
            {claimState.status === 'pending' && 'waiting for the transaction to land'}
            {['success', 'cancelled', 'error', 'idle'].includes(claimState.status) && 'moving on…'}
          </span>
          <span className="actionbar__steps" aria-hidden="true">
            {sweep.chains.map((chainId, i) => (
              <span
                key={chainId}
                className={`actionbar__step ${i < sweep.index ? 'actionbar__step--done' : ''} ${i === sweep.index ? 'actionbar__step--now' : ''}`}
                style={{ background: CHAIN_BY_ID.get(chainId)?.color }}
              />
            ))}
          </span>
        </footer>
      ) : (
        !readOnly &&
        selectedPositions.length > 0 && (
          <footer className="actionbar">
            <span>
              {selectedPositions.length} selected across{' '}
              {new Set(selectedPositions.map((p) => p.chainId)).size} chains
            </span>
            <button className="btn btn--primary" onClick={requestClaimSelected}>
              Review and claim
            </button>
          </footer>
        )
      )}

      {review && owner && !readOnly && review.owner === owner && (
        <ClaimReview
          owner={owner}
          selection={review.selection}
          onConfirm={confirmReview}
          onClose={closeReview}
        />
      )}

      {infoTab && <InfoPanel tab={infoTab} onTab={setInfoTab} onClose={() => setInfoTab(null)} />}
    </div>
  )
}
