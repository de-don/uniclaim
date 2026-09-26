import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { WagmiProvider } from 'wagmi'
import { Root } from './Root'
import { config } from './wagmi'

const queryClient = new QueryClient()

/**
 * A looked-up address lives in the URL fragment, which browsers never send to
 * a server — but analytics scripts read `location.href` themselves. Cutting
 * the URL down to its path keeps the promise that no address reaches them.
 */
function pathOnly<T extends { url: string }>(event: T): T {
  const url = new URL(event.url)
  return { ...event, url: url.origin + url.pathname }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#ff007a', borderRadius: 'medium' })}>
          <Root />
          {/* Page-level only: visits and web vitals. Neither is ever handed a
              wallet address — no custom events are sent from anywhere in this app. */}
          <Analytics beforeSend={pathOnly} />
          <SpeedInsights beforeSend={pathOnly} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
