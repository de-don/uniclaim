import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useCallback, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ChainGroup } from './components/ChainGroup'
import { Landing } from './components/Landing'
import { CHAIN_BY_ID, CHAINS } from './config/chains'
import { useClaim } from './hooks/useClaim'
import { usePositions } from './hooks/usePositions'
import { formatUsd } from './lib/format'
import { MAX_POSITIONS } from './lib/scan'
import type { Position } from './lib/types'

export default function App() {
  const { address, isConnected } = useAccount()
  const { scans, isScanning, rescan, removePositions } = usePositions(address)
  const { claim, state: claimState } = useClaim()
  const [selected, setSelected] = useState<Set<string>>(new Set())

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
    () => allPositions.reduce<number | null>((sum, p) => (p.usd === null || sum === null ? sum : sum + p.usd), 0),
    [allPositions],
  )

  const failedChains = scans.filter((s) => s.status === 'error')
  const truncated = scans.filter((s) => s.skipped > 0)

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

  /** Selection can span chains; each chain still needs its own transaction. */
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
        <div className="topbar__right">
          {isConnected && (
            <button className="btn btn--ghost" onClick={() => void rescan()} disabled={isScanning}>
              {isScanning ? 'Сканируем…' : 'Обновить'}
            </button>
          )}
          <ConnectButton showBalance={false} />
        </div>
      </header>

      <main className="main">
        {!isConnected ? (
          <Landing />
        ) : (
          <>
            <div className="summary">
              <div>
                <span className="summary__label">Несобранные комиссии</span>
                <span className="summary__value">{formatUsd(totalUsd)}</span>
              </div>
              <div>
                <span className="summary__label">Позиций с комиссиями</span>
                <span className="summary__value">{allPositions.length}</span>
              </div>
              <div>
                <span className="summary__label">Сетей</span>
                <span className="summary__value">{groups.length}</span>
              </div>
            </div>

            {isScanning && (
              <div className="scanbar">
                <div className="scanbar__fill" />
                <span>
                  Сканируем {CHAINS.length} сетей — результаты появляются по мере ответа RPC
                </span>
              </div>
            )}

            {truncated.length > 0 && (
              <div className="banner banner--error">
                В {truncated.map((s) => CHAIN_BY_ID.get(s.chainId)?.chain.name).join(', ')} кошелёк
                держит больше {MAX_POSITIONS} позиций — просканированы только первые{' '}
                {MAX_POSITIONS}. Укажите свой RPC, чтобы обойти лимит публичного узла.
              </div>
            )}

            {failedChains.length > 0 && (
              <div className="banner banner--error">
                Не удалось опросить:{' '}
                {failedChains
                  .map((s) => CHAIN_BY_ID.get(s.chainId)?.chain.name ?? s.chainId)
                  .join(', ')}
                . Обычно это лимит публичного RPC — нажмите «Обновить» или задайте свой RPC.
              </div>
            )}

            {!isScanning && groups.length === 0 && (
              <div className="empty">
                <h2>Собирать нечего</h2>
                <p>Ни одной Uniswap V3 позиции с несобранными комиссиями в поддерживаемых сетях.</p>
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
            Выбрано {selectedPositions.length} позиций в{' '}
            {new Set(selectedPositions.map((p) => p.chainId)).size} сетях
          </span>
          <button className="btn btn--primary" onClick={() => void claimSelectedEverywhere()}>
            Собрать выбранное
          </button>
        </footer>
      )}
    </div>
  )
}
