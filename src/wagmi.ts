import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { fallback, http } from 'wagmi'
import { CHAINS, SUPPORTED_CHAINS } from './config/chains'

/**
 * A per-chain override (VITE_RPC_1=https://…) wins outright; otherwise we stack
 * the vetted public endpoints behind a fallback transport so one provider's
 * rate limit does not end the scan.
 */
function transportFor(chainId: number, rpcUrls: string[]) {
  const override = import.meta.env[`VITE_RPC_${chainId}`] as string | undefined
  const urls = override ? [override, ...rpcUrls] : rpcUrls
  return fallback(
    urls.map((url) => http(url, { retryCount: 2, retryDelay: 300, timeout: 20_000 })),
    { rank: false, retryCount: 1 },
  )
}

export const config = getDefaultConfig({
  appName: 'UniClaim',
  projectId: (import.meta.env.VITE_WC_PROJECT_ID as string) || 'uniclaim-local-dev',
  chains: SUPPORTED_CHAINS,
  transports: Object.fromEntries(
    CHAINS.map((c) => [c.chain.id, transportFor(c.chain.id, c.rpcUrls)]),
  ),
  ssr: false,
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
