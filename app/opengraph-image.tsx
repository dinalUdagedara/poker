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
const CARD_TOP = '#fefdfb' // the card face, top of its gradient
const CARD_BOTTOM = '#ebe7e2'
const CARD_INK = '#1e1311'

/**
 * The hand the lobby deals behind its panel, dealt again here.
 *
 * A royal flush is the one hand that needs no caption to say what game this
 * is, and using the lobby's own cards means the link and the page it opens
 * are recognisably the same room.
 */
const FAN = [
  { rank: 'A', rotate: -14, lift: 10 },
  { rank: 'K', rotate: -7, lift: 2 },
  { rank: 'Q', rotate: 0, lift: 0 },
  { rank: 'J', rotate: 7, lift: 2 },
  { rank: '10', rotate: 14, lift: 10 },
]

/**
 * The pip, drawn rather than typed.
 *
 * Neither Playfair nor Geist carries U+2660, and Satori has no system fonts to
 * fall back to — a literal ♠ comes out as a blank box. A path always renders.
 */
function Spade({ size: s }: { size: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={CARD_INK}>
      <path d="M12 2.2c0 0-8.2 6.4-8.2 11.4a4.6 4.6 0 0 0 7.7 3.4c-.2 2-1.1 3.4-2.7 4.3h6.4c-1.6-.9-2.5-2.3-2.7-4.3a4.6 4.6 0 0 0 7.7-3.4C20.2 8.6 12 2.2 12 2.2z" />
    </svg>
  )
}

export default async function Image() {
  // process.cwd() is the project root, so these resolve the same in `next dev`
  // and in a build — which is when this image is actually rendered.
  const [playfair, geist, geistMedium] = await Promise.all([
    readFile(join(process.cwd(), 'assets/PlayfairDisplay-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/Geist-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/Geist-Medium.ttf')),
  ])

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
          {/* The fan. Each card is tilted by the wrapper so the shadow tilts
              with it, and pulled left to overlap the one before. */}
          <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 52 }}>
            {FAN.map((card, i) => (
              <div
                key={card.rank}
                style={{
                  display: 'flex',
                  marginLeft: i === 0 ? 0 : -26,
                  transform: `translateY(${card.lift}px) rotate(${card.rotate}deg)`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 124,
                    height: 176,
                    borderRadius: 14,
                    border: '1px solid rgba(0,0,0,0.25)',
                    backgroundImage: `linear-gradient(180deg, ${CARD_TOP} 0%, ${CARD_BOTTOM} 100%)`,
                    boxShadow: '0 14px 34px -8px rgba(0,0,0,0.8)',
                    color: CARD_INK,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'Playfair Display',
                      fontSize: 56,
                      lineHeight: 1,
                      letterSpacing: '-0.02em',
                      marginBottom: 8,
                    }}
                  >
                    {card.rank}
                  </div>
                  <Spade size={46} />
                </div>
              </div>
            ))}
          </div>

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
