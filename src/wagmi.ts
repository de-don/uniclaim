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

/**
 * What a wallet shows on its approval screen. A prompt with a name, an icon and
 * a matching origin reads as a real application; one with a blank icon and no
 * description is what a phishing page looks like, so these are worth filling in
 * even though they are optional. The icon must be an absolute URL — wallets
 * fetch it from their own context, not the page's.
 */
export const config = getDefaultConfig({
  appName: 'UniClaim',
  appDescription:
    'Claim unclaimed Uniswap v3 and v4 fees from every position you own, batched into one transaction per chain.',
  appUrl: 'https://uniclaim.org',
  appIcon: 'https://uniclaim.org/icon-512.png',
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
