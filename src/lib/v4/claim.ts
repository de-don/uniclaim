import { concatHex, encodeAbiParameters, numberToHex, type Hex } from 'viem'
import { V4Actions } from '../../abi/v4'
import type { Position } from '../types'
import { NATIVE_CURRENCY } from './scan'

const DECREASE_PARAMS = [
  { type: 'uint256' }, // tokenId
  { type: 'uint256' }, // liquidity to remove
  { type: 'uint128' }, // amount0Min
  { type: 'uint128' }, // amount1Min
  { type: 'bytes' }, // hookData
] as const

const CLOSE_CURRENCY_PARAMS = [{ type: 'address' }] as const

/**
 * v4 has no `collect`. Fees are realised by decreasing liquidity by zero, which
 * settles everything the position has accrued into the caller's credit, and then
 * taking that credit.
 *
 * All of it happens inside one `unlock`, so a single call drains any number of
 * positions across any number of pools: one DECREASE_LIQUIDITY per position,
 * then one CLOSE_CURRENCY per distinct currency. Closing per currency rather
 * than per pool matters — two positions sharing a token would otherwise try to
 * withdraw the same credit twice.
 *
 * CLOSE_CURRENCY is used in preference to TAKE_PAIR because it takes no
 * recipient: the balance goes to whoever sent the transaction. As on v3, there
 * is no field for this app to point somewhere else. (TAKE_ALL, the obvious
 * candidate, is a router action the position manager rejects outright.)
 */
export function encodeV4Claim(positions: Position[]): Hex {
  const actions: number[] = []
  const params: Hex[] = []

  for (const position of positions) {
    actions.push(V4Actions.DECREASE_LIQUIDITY)
    params.push(encodeAbiParameters(DECREASE_PARAMS, [position.tokenId, 0n, 0n, 0n, '0x']))
  }

  const currencies = [
    ...new Set(
      positions.flatMap((p) => [p.token0.address.toLowerCase(), p.token1.address.toLowerCase()]),
    ),
  ] as `0x${string}`[]

  // v4 requires currencies to be handled in ascending order within an unlock;
  // the zero address used for native ETH sorts first, which is also correct.
  currencies.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))

  for (const currency of currencies) {
    actions.push(V4Actions.CLOSE_CURRENCY)
    params.push(encodeAbiParameters(CLOSE_CURRENCY_PARAMS, [currency]))
  }

  const actionBytes = concatHex(actions.map((a) => numberToHex(a, { size: 1 })))
  return encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actionBytes, params])
}

export function isNative(address: string): boolean {
  return address.toLowerCase() === NATIVE_CURRENCY
}
