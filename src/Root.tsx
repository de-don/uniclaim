import { useEffect, useState } from 'react'
import App from './App'
import { Preview, type PreviewVariant } from './components/Preview'

/**
 * Chooses between the app and the development layout harness.
 *
 * Typing `#preview` into the address bar fires hashchange without reloading the
 * page, so the hash has to be state rather than a value read once at startup.
 * The harness is stripped from a production build.
 */
export function Root() {
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (import.meta.env.DEV && hash.startsWith('#preview')) {
    const variant = hash.slice('#preview-'.length) as PreviewVariant
    return <Preview variant={['receipts', 'review'].includes(variant) ? variant : 'list'} />
  }
  return <App />
}
