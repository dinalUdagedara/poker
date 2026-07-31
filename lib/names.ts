/**
 * Display names.
 *
 * A name is decoration: it labels a seat and grants nothing. Nobody is
 * identified by it, two players may happily share one, and the server never
 * looks anything up by it. That is why there is no uniqueness check and no
 * registry — the cookie is still what says who you are.
 */

const ADJECTIVES = [
  'Quiet',
  'Lucky',
  'Steady',
  'Bold',
  'Sly',
  'Calm',
  'Sharp',
  'Idle',
  'Brave',
  'Wry',
  'Swift',
  'Patient',
  'Cheerful',
  'Solemn',
  'Restless',
  'Gentle',
]

const ANIMALS = [
  'Otter',
  'Magpie',
  'Badger',
  'Heron',
  'Fox',
  'Marten',
  'Raven',
  'Hare',
  'Lynx',
  'Stoat',
  'Falcon',
  'Wolf',
  'Owl',
  'Pike',
  'Crane',
  'Weasel',
]

/** The longest name anyone may choose. Long enough to be a name, short enough to sit at a seat. */
export const MAX_NAME_LENGTH = 16

/**
 * A stable name for a player who has not chosen one.
 *
 * Derived from their id rather than drawn at random, so the same person is
 * called the same thing every time without anything being stored. Two players
 * can collide, which is fine — the name is a label, not an identity.
 */
export function generatedName(playerId: string): string {
  let hash = 0
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0
  }

  const adjective = ADJECTIVES[hash % ADJECTIVES.length]
  const animal = ANIMALS[Math.floor(hash / ADJECTIVES.length) % ANIMALS.length]
  return `${adjective} ${animal}`
}

/**
 * Make a chosen name safe to show to other people.
 *
 * Returns null when nothing usable is left, which is the caller's cue to
 * generate one instead.
 */
export function sanitiseName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null

  const cleaned = raw
    // Control characters, zero-width joiners and the bidirectional overrides.
    // Left in, they let a name hide characters or visually reorder the text
    // beside it, which at a table means impersonating the seat next door.
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    // Collapsed so a name cannot be padded out to shove other seats around.
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)

  return cleaned.length > 0 ? cleaned : null
}

/** What to call this player: what they chose, or what they were given. */
export function nameFor(playerId: string, chosen: unknown): string {
  return sanitiseName(chosen) ?? generatedName(playerId)
}
