/**
 * The guide's own table of contents.
 *
 * Ordered the way someone learns rather than by depth: what the game is, then
 * what beats what, then the money, then how to think, then the room. Somebody
 * who reads only the first page still knows how to play.
 *
 * Its own module, with no `'use client'` on it, because both the client nav and
 * the server-rendered pages read it. A plain value exported from a client module
 * arrives at a Server Component as a reference to be sent to the browser rather
 * than as the array itself, and only fails when something tries to use it.
 */
export const GUIDE_PAGES: Array<{ href: string; label: string; blurb: string }> = [
  {
    href: '/how-to-play',
    label: 'The basics',
    blurb: 'How a hand runs, and what every button does.',
  },
  {
    href: '/how-to-play/hands',
    label: 'What beats what',
    blurb: 'The rankings, kickers, and how ties are settled.',
  },
  {
    href: '/how-to-play/betting',
    label: 'Betting',
    blurb: 'Minimums, all-ins, side pots and split pots.',
  },
  {
    href: '/how-to-play/strategy',
    label: 'How to think',
    blurb: 'Position, pot odds, outs and bluffing.',
  },
  {
    href: '/how-to-play/rooms',
    label: 'With people',
    blurb: 'Rooms, invites, the clock and rematches.',
  },
]
