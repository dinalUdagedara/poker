import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { OG_IMAGE, SITE_NAME } from '@/lib/site'

// Taken from the same place the meta tags are, so what is announced and what
// is drawn cannot disagree.
export const alt = OG_IMAGE.alt
export const size = { width: OG_IMAGE.width, height: OG_IMAGE.height }
export const contentType = 'image/png'

/*
 * The room, in hex.
 *
 * Everything else in the app reads its colour from the oklch tokens in
 * globals.css, but Satori — the renderer behind ImageResponse — parses a much
 * older CSS than a browser does and does not understand oklch. These are the
 * same tokens converted to sRGB, and they have to be kept in step with
 * globals.css by hand. They are the only place in the codebase that duplicates
 * a colour value.
 */
const BACKGROUND = '#1b0405' // --background
const ROOM_LIT = '#511014' // the lit centre of .table-room
const ROOM_MID = '#37070b'
const BRASS = '#e9b44b' // --brass
const BRASS_DEEP = '#744c0e' // --brass-deep
const CREAM = '#fbf4ed' // --foreground
const MUTED = '#bba69d' // --muted-foreground

/**
 * The crest, at the size it is drawn here.
 *
 * `public/mark.png` is the transparent cut of the master in `assets/`, so the
 * room's gradient shows through the open middle of the diamond rather than the
 * mark bringing a plate of its own — the same reason the header uses it.
 */
const CREST = { width: 188, height: 210 }

export default async function Image() {
  // process.cwd() is the project root, so these resolve the same in `next dev`
  // and in a build — which is when this image is actually rendered.
  const [playfair, geist, geistMedium, crest] = await Promise.all([
    readFile(join(process.cwd(), 'assets/PlayfairDisplay-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/Geist-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/Geist-Medium.ttf')),
    readFile(join(process.cwd(), 'public/mark.png')),
  ])

  // Inlined rather than linked. Satori fetches a remote `src` over the network,
  // and this is rendered during the build, when the site it would be fetching
  // from is the thing being built.
  const crestSrc = `data:image/png;base64,${crest.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: BACKGROUND,
        }}
      >
        {/* The room: one surface lit from above the table, falling off to the
            corners. The same gradient .table-room paints on the page. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            // The radii are .table-room's 78% × 62% resolved against 1200×630,
            // and the centre its 50% 32%. Satori will not take the percentage
            // form, so the arithmetic is done here.
            backgroundImage: `radial-gradient(ellipse 936px 390px at 600px 202px, ${ROOM_LIT} 0%, ${ROOM_MID} 45%, ${BACKGROUND} 100%)`,
          }}
        />

        {/* The lit edge. Every raised thing in this app has a brass hairline
            along its top; at this scale the whole image is the raised thing. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: 5,
            backgroundImage: `linear-gradient(90deg, ${BACKGROUND} 0%, ${BRASS} 50%, ${BACKGROUND} 100%)`,
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            padding: '0 80px',
          }}
        >
          {/* The house crest, over the name the way a house puts its mark over
              its door — and the same mark the tab and the header carry, so a
              link and the page it opens are recognisably the same room. */}
          <img
            src={crestSrc}
            width={CREST.width}
            height={CREST.height}
            style={{ marginBottom: 40 }}
            alt=""
          />

          {/* Casino signage reads as an eyebrow over a name, so it is set the
              way signage is: small, brass, and spaced out. */}
          <div
            style={{
              display: 'flex',
              fontFamily: 'Geist Medium',
              fontSize: 21,
              letterSpacing: '0.38em',
              textTransform: 'uppercase',
              color: BRASS,
              marginBottom: 14,
            }}
          >
            No-limit Texas Hold’em
          </div>

          <div
            style={{
              display: 'flex',
              fontFamily: 'Playfair Display',
              fontSize: 128,
              lineHeight: 1,
              letterSpacing: '-0.025em',
              color: CREAM,
            }}
          >
            {SITE_NAME}
          </div>

          {/* The one line that has to survive being shown at thumbnail size:
              what you can do here, and that it costs nothing to start. */}
          <div
            style={{
              display: 'flex',
              fontFamily: 'Geist',
              fontSize: 30,
              color: MUTED,
              marginTop: 22,
            }}
          >
            Play a table of bots, or deal your friends in with a link.
          </div>
        </div>

        {/* A rule along the foot, dimmer than the one on top — light in this
            room comes from above, so the far edge of anything is unlit. */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            backgroundImage: `linear-gradient(90deg, ${BACKGROUND} 0%, ${BRASS_DEEP} 50%, ${BACKGROUND} 100%)`,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Playfair Display', data: playfair, style: 'normal', weight: 700 },
        { name: 'Geist', data: geist, style: 'normal', weight: 400 },
        { name: 'Geist Medium', data: geistMedium, style: 'normal', weight: 500 },
      ],
    },
  )
}
