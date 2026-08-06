import type { Metadata } from 'next'
import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

/**
 * The house lettering.
 *
 * A didone, because that is what casino signage, chip inlays and the back of a
 * deck are set in — it does more to say "room" than any amount of colour. It
 * carries names, titles and card ranks only; anything read while deciding
 * stays in the sans, which is legible at a glance in a way this is not.
 */
const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Showdown',
  description: 'No-limit Texas Hold’em, against bots or against your friends.',
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
      className={`dark ${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">{children}</body>
    </html>
  )
}
