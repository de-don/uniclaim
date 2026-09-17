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

/**
 * WalletConnect needs a real project id; its API answers 403 to anything else.
 * Without one, browser-extension wallets still connect but every mobile wallet
 * silently cannot — worth saying out loud rather than letting it look like the
 * app is broken.
 */
export const walletConnectProjectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined
export const hasWalletConnect = Boolean(walletConnectProjectId)

export const config = getDefaultConfig({
  appName: 'UniClaim',
  projectId: walletConnectProjectId || 'uniclaim-local-dev',
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
