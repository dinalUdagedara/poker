import type { Metadata } from 'next'
import { Bodoni_Moda, Oswald } from 'next/font/google'
import { GeistSans } from 'geist/font/sans'
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteUrl } from '@/lib/site'
import './globals.css'

/**
 * Everything read while playing, figures included.
 *
 * Geist: a quiet grotesque that stays out of the way of the lettering above
 * it, and tight enough to keep a dock of buttons compact. It carries tabular,
 * lining figures, so stacks and bets line up in a column without falling back
 * to a monospace that makes money read like a terminal.
 *
 * Shipped with the app rather than fetched from Google's library, which does
 * not carry it. It brings its own `--font-geist-sans`, which `globals.css`
 * points the sans and figure roles at.
 */
const sans = GeistSans

/**
 * The house lettering.
 *
 * A high-contrast didone, the face of a private room's menu and a deck's
 * box — it does more to say "salon" than any amount of colour. It carries
 * names, titles and monograms only; anything read while deciding stays in the
 * sans, which is legible at a glance in a way this is not. The italic is the
 * monogram struck on every seat.
 */
const bodoni = Bodoni_Moda({
  variable: '--font-bodoni',
  subsets: ['latin'],
  style: ['normal', 'italic'],
})

/**
 * Card indices, and nothing else.
 *
 * A condensed face lets the rank stand tall in the corner the way ClubGG
 * prints it, so a card is read by its shape from across the table. The didone
 * is too wide and too fine for a "10" at that size.
 */
const oswald = Oswald({
  variable: '--font-oswald',
  subsets: ['latin'],
  weight: ['500'],
})

/**
 * What a link to this app says about itself.
 *
 * Most arrivals here come through a pasted URL rather than a search, so the
 * unfurled card in a chat window is the real front door — it is doing the work
 * a landing page would otherwise do. Everything below exists to make that card
 * say, without being clicked, what the game is and that it costs nothing.
 *
 * `metadataBase` is what lets the rest of this use relative paths: the OG image
 * is generated at `/opengraph-image.png` by `opengraph-image.tsx`, and Next
 * resolves it against this origin. Pages below inherit all of it and override
 * only the title and description, so there is one place to change the framing.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    // Page titles read as their own sentence and then get the house name, so
    // a browser tab says "How to play · Showdown" rather than repeating it.
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: 'games',
  keywords: [
    'texas holdem',
    'poker',
    'no-limit hold’em',
    'online poker with friends',
    'free poker',
    'play money poker',
    'poker against bots',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    url: '/',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    // The image is 1200×630, which is a large card's aspect ratio. Left to
    // itself X would crop it to a square thumbnail beside the text.
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // The table is a dark room regardless of the OS theme: felt, chips and
    // white card faces all depend on the surround staying dark.
    <html
      lang="en"
      className={`dark ${sans.variable} ${bodoni.variable} ${oswald.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">{children}</body>
    </html>
  )
}
