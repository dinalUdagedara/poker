import type { Metadata } from 'next'

/**
 * Where this app lives, as far as a crawler is concerned.
 *
 * Open Graph tags have to carry absolute URLs — a scraper reads the markup on
 * its own machine and has nothing to resolve `/opengraph-image.png` against.
 * So the origin has to be stated rather than inferred from the request.
 *
 * The order below is deliberate. `NEXT_PUBLIC_SITE_URL` is the override for
 * anyone running this on their own domain. `VERCEL_ENV` distinguishes the
 * production deployment — which always answers on the stable alias, not the
 * per-commit URL — from previews, where `VERCEL_URL` is the only address that
 * resolves. Local development falls through to the dev server, so a link
 * unfurled from a tunnel at least points at something.
 */
const PRODUCTION_URL = 'https://poker-pearl-gamma.vercel.app'

function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_ENV === 'production') return PRODUCTION_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export const siteUrl = resolveSiteUrl()

/** The house name, and the one sentence that says what the thing is. */
export const SITE_NAME = 'Showdown'
export const SITE_TAGLINE = 'No-limit Texas Hold’em'
export const SITE_DESCRIPTION =
  'No-limit Texas Hold’em in the browser. Play a table of bots or deal your friends in with a link — no account, no download, no chips to buy.'

/**
 * The share image, and the only description of it.
 *
 * `app/opengraph-image.tsx` draws it and takes its dimensions from here, so
 * the numbers announced to a scraper cannot drift from the ones rendered.
 *
 * The URL is written out rather than left to Next's file convention. That
 * convention only attaches an image to segments that don't declare their own
 * `openGraph` block — every page here declares one, so relying on it left
 * three of the four routes unfurling as a bare link. Naming it costs the
 * content hash Next would otherwise append, so if the art is ever redrawn,
 * bump the query below: scrapers cache by URL and will otherwise keep serving
 * the old picture.
 */
export const OG_IMAGE = {
  url: '/opengraph-image?v=1',
  width: 1200,
  height: 630,
  alt: 'Showdown — a royal flush in spades dealt across a dark oxblood table, under the house lettering',
} as const

/**
 * A page's share card, built rather than written out.
 *
 * Metadata does not deep-merge: a page that declares an `openGraph` block
 * replaces its parent's entirely, silently taking the image and the card size
 * with it. That is easy to do by accident and invisible until a link is pasted
 * somewhere, so pages go through here instead of assembling the object by
 * hand — every one of them gets a full card or none of them do.
 */
export function shareCard({
  title,
  description,
  path,
  type = 'website',
}: {
  /** The page's own title, without the house name. */
  title: string
  description: string
  /** Absolute path, used for the canonical link and `og:url`. */
  path?: string
  type?: 'website' | 'article'
}): Metadata {
  const headline = `${title} · ${SITE_NAME}`

  return {
    title,
    description,
    ...(path ? { alternates: { canonical: path } } : {}),
    openGraph: {
      type,
      siteName: SITE_NAME,
      locale: 'en_US',
      title: headline,
      description,
      images: [OG_IMAGE],
      ...(path ? { url: path } : {}),
    },
    twitter: { card: 'summary_large_image', title: headline, description, images: [OG_IMAGE] },
  }
}
