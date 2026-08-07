import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/site'

/**
 * What this looks like once it is saved to a home screen.
 *
 * A pasted link is the front door here, and on a phone the next thing that
 * happens to a link people keep coming back to is that it gets added to the
 * home screen — at which point the browser wants a name, a colour and a square
 * icon, and invents unflattering versions of all three if it isn't given them.
 *
 * The icons are the PNGs in `public/`, not `app/icon.svg`. Next fingerprints the
 * app-directory icon files and serves them from a hashed URL, so there is no
 * stable path to write here; anything under `public/` keeps the name it was
 * given. Both are rendered from the same master art — see `npm run icons`.
 *
 * `theme_color` is `--background`, which is what colours the phone's status bar
 * once the app is opened standalone. The room runs to the top of the screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1b0405',
    theme_color: '#1b0405',
    categories: ['games'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
