import { useState, type FormEvent } from 'react'
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
  const [status, setStatus] = useState<
    { kind: 'idle' } | { kind: 'checking' } | { kind: 'error'; message: string } | { kind: 'added' }
  >({ kind: 'idle' })

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
    setLink('')
    setStatus({ kind: 'added' })
    onAdded()
  }

  if (!open) {
    return (
      <p className="footnote">
        Missing a v4 position?{' '}
        <button className="link" onClick={() => setOpen(true)}>
          Add it by its Uniswap link
        </button>
      </p>
    )
  }

  return (
    <form className="lookup lookup--add" onSubmit={(e) => void submit(e)}>
      <label className="lookup__label" htmlFor="add-position">
        Paste the position's link from app.uniswap.org — it is checked on chain before it is added
      </label>
      <div className="lookup__row">
        <input
          id="add-position"
          className="lookup__input"
          placeholder="https://app.uniswap.org/positions/v4/bnb/…"
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            if (status.kind !== 'checking') setStatus({ kind: 'idle' })
          }}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn" type="submit" disabled={!link.trim() || status.kind === 'checking'}>
          {status.kind === 'checking' ? 'Checking…' : 'Add'}
        </button>
      </div>
      {status.kind === 'error' && (
        <p className="lookup__error" role="alert">
          {status.message}
        </p>
      )}
      {status.kind === 'added' && (
        <p className="lookup__ok" role="status">
          Added — scanning it in now, and on every visit from this browser. If it has no fees yet,
          it sits behind "Hide positions with no fees".
        </p>
      )}
    </form>
  )
}
