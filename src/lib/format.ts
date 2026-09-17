import { formatUnits } from 'viem'

export function formatAmount(value: bigint, decimals: number): string {
  const n = Number(formatUnits(value, decimals))
  if (n === 0) return '0'
  if (n < 0.000001) return '<0.000001'
  if (n < 1) return n.toFixed(6).replace(/0+$/, '')
  if (n < 1000) return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function formatUsd(value: number | null): string {
  if (value === null) return '—'
  if (value === 0) return '$0.00'
  if (value < 0.01) return '<$0.01'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatFeeTier(fee: number): string {
  return `${fee / 10000}%`
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
