import { useEffect, useState, type FormEvent } from 'react'
import type { PublicClient } from 'viem'
import { getPublicClient } from 'wagmi/actions'
import { v4PositionManagerAbi } from '../abi/v4'
import { CHAINS } from '../config/chains'
import { V4_BY_CHAIN } from '../config/v4'
import { shortAddress } from '../lib/format'
import { addManualV4Id } from '../lib/v4/discover'
import { config } from '../wagmi'

type Parsed = { chainId: number; tokenId: bigint } | { error: string }

/** Reads `…/positions/v4/<chain>/<id>`, the shape of a Uniswap interface link. */
function parse(input: string): Parsed {
  const match = input.trim().match(/positions\/(v3|v4)\/([a-z0-9-]+)\/(\d+)/i)
  if (!match) return { error: 'Paste a link like app.uniswap.org/positions/v4/bnb/123456' }
  const [, version, slug, id] = match
  if (version.toLowerCase() === 'v3') {
    return { error: 'v3 positions are found automatically — this one should already be listed.' }
  }
  const chain = CHAINS.find((c) => c.uniswapSlug === slug.toLowerCase())
  if (!chain || !V4_BY_CHAIN.has(chain.chain.id)) {
    return { error: `v4 on "${slug}" is not supported here yet.` }
  }
  return { chainId: chain.chain.id, tokenId: BigInt(id) }
}

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'error'; message: string }
  | { kind: 'added' }

type Props = {
  owner: `0x${string}`
  /** Called once the position is confirmed and remembered, to scan it in. */
  onAdded: () => void
}

/**
 * The way in for a v4 position no explorer lists — on BNB Chain that is every
 * one of them. Checked against `ownerOf` straight away, so a link to someone
 * else's position is refused here rather than silently dropped by the scan.
 */
export function AddPosition({ owner, onAdded }: Props) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parse(link)
    if ('error' in parsed) {
      setStatus({ kind: 'error', message: parsed.error })
      return
    }

    setStatus({ kind: 'checking' })
    const v4 = V4_BY_CHAIN.get(parsed.chainId)!
    const client = getPublicClient(config, { chainId: parsed.chainId }) as PublicClient | undefined
    try {
      if (!client) throw new Error('No RPC for this chain')
      const holder = await client.readContract({
        address: v4.positionManager,
        abi: v4PositionManagerAbi,
        functionName: 'ownerOf',
        args: [parsed.tokenId],
      })
      if (holder.toLowerCase() !== owner.toLowerCase()) {
        setStatus({
          kind: 'error',
          message: `Position #${parsed.tokenId} belongs to ${shortAddress(holder)}, not to this address.`,
        })
        return
      }
    } catch {
      setStatus({
        kind: 'error',
        message: `Could not read position #${parsed.tokenId} — it may have been burned, or the node did not answer.`,
      })
      return
    }

    addManualV4Id(parsed.chainId, owner, parsed.tokenId)
    setStatus({ kind: 'added' })
    onAdded()
  }

  const close = () => {
    setOpen(false)
    setLink('')
    setStatus({ kind: 'idle' })
  }

  return (
    <>
      <p className="footnote">
        Missing a v4 position?{' '}
        <button className="link" onClick={() => setOpen(true)}>
          Add it by its Uniswap link
        </button>
      </p>
      {open && <AddPositionDialog {...{ link, setLink, status, setStatus, submit, close }} />}
    </>
  )
}

type DialogProps = {
  link: string
  setLink: (value: string) => void
  status: Status
  setStatus: (status: Status) => void
  submit: (event: FormEvent) => Promise<void>
  close: () => void
}

function AddPositionDialog({ link, setLink, status, setStatus, submit, close }: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const added = status.kind === 'added'

  return (
    <div className="overlay overlay--center" onClick={close} role="presentation">
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-position-title"
      >
        <header className="dialog__head">
          <h2 id="add-position-title" className="dialog__title">
            Add a v4 position
          </h2>
          <button type="button" className="panel__close" onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        <p className="dialog__text">
          Paste the position's link from app.uniswap.org. It is checked on chain that the position
          belongs to this address before anything is added, and it is remembered in this browser.
        </p>

        <input
          className="lookup__input"
          placeholder="https://app.uniswap.org/positions/v4/bnb/…"
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            if (status.kind !== 'checking') setStatus({ kind: 'idle' })
          }}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          disabled={added}
          aria-label="Position link"
        />

        {status.kind === 'error' && (
          <p className="lookup__error" role="alert">
            {status.message}
          </p>
        )}
        {added && (
          <p className="lookup__ok" role="status">
            Added — it is being scanned in now. If it has no fees yet, it sits behind "Hide
            positions with no fees".
          </p>
        )}

        <footer className="dialog__foot">
          {added ? (
            <button type="button" className="btn btn--primary" onClick={close}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={!link.trim() || status.kind === 'checking'}
              >
                {status.kind === 'checking' ? 'Checking…' : 'Add position'}
              </button>
            </>
          )}
        </footer>
      </form>
    </div>
  )
}
