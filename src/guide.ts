import { inject } from '@vercel/analytics'

// Page views only, like the app, with the URL cut to its path for the same reason.
inject({
  beforeSend: (event) => {
    const url = new URL(event.url)
    return { ...event, url: url.origin + url.pathname }
  },
})
