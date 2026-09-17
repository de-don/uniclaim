import type { ChainConfig } from '../config/chains'
import { formatUsd } from '../lib/format'
import type { Position } from '../lib/types'
import { batchCount, type ClaimState } from '../hooks/useClaim'
import { PositionRow } from './PositionRow'

type Props = {
  config: ChainConfig
  positions: Position[]
  selected: Set<string>
  onToggle: (key: string) => void
  onToggleChain: (chainId: number, next: boolean) => void
  onClaim: (chainId: number, positions: Position[]) => void
  claimState: ClaimState
}

export function ChainGroup({
  config,
  positions,
  selected,
  onToggle,
  onToggleChain,
  onClaim,
  claimState,
}: Props) {
  const chainId = config.chain.id
  const selectedHere = positions.filter((p) => selected.has(p.key))
  const allSelected = positions.length > 0 && selectedHere.length === positions.length

  const totalUsd = positions.reduce<number | null>(
    (sum, p) => (p.usd === null || sum === null ? sum : sum + p.usd),
    0,
  )

  const busy =
    claimState.chainId === chainId &&
    ['switching', 'signing', 'pending'].includes(claimState.status)

  const explorer = config.chain.blockExplorers?.default.url

  const batch = claimState.batch
  const progress = batch && batch.total > 1 ? ` ${batch.index} из ${batch.total}` : ''

  return (
    <section className="group">
      <header className="group__head">
        <label className="group__check">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleChain(chainId, e.target.checked)}
          />
        </label>

        <span className="group__dot" style={{ background: config.color }} />
        <h2 className="group__name">{config.chain.name}</h2>
        <span className="group__count">
          {positions.length} {positions.length === 1 ? 'позиция' : 'позиций'}
          {batchCount(positions.length) > 1 && ` · ${batchCount(positions.length)} транзакции`}
        </span>
        <span className="group__usd">{formatUsd(totalUsd)}</span>

        <div className="group__actions">
          {selectedHere.length > 0 && selectedHere.length < positions.length && (
            <button className="btn" onClick={() => onClaim(chainId, selectedHere)} disabled={busy}>
              Собрать выбранное ({selectedHere.length})
            </button>
          )}
          <button
            className="btn btn--primary"
            onClick={() => onClaim(chainId, positions)}
            disabled={busy}
            title={
              batchCount(positions.length) > 1
                ? `${batchCount(positions.length)} транзакции — столько позиций не помещается в одну по газу`
                : 'Одна транзакция на все позиции'
            }
          >
            {busy ? 'Отправка…' : `Собрать всё (${positions.length})`}
          </button>
        </div>
      </header>

      {claimState.chainId === chainId && claimState.status !== 'idle' && (
        <div className={`banner banner--${claimState.status}`}>
          {claimState.status === 'switching' && 'Переключите сеть в кошельке…'}
          {claimState.status === 'signing' &&
            `Подтвердите транзакцию в кошельке${progress}…`}
          {claimState.status === 'pending' && `Транзакция${progress} в сети, ждём подтверждения…`}
          {claimState.status === 'success' && 'Комиссии собраны.'}
          {claimState.status === 'error' && `Ошибка: ${claimState.error}`}
          {claimState.hash && explorer && (
            <a href={`${explorer}/tx/${claimState.hash}`} target="_blank" rel="noreferrer">
              Открыть в эксплорере
            </a>
          )}
        </div>
      )}

      <div className="group__rows">
        {positions.map((position) => (
          <PositionRow
            key={position.key}
            position={position}
            selected={selected.has(position.key)}
            onToggle={onToggle}
            onClaim={(p) => onClaim(chainId, [p])}
            busy={busy}
          />
        ))}
      </div>
    </section>
  )
}
