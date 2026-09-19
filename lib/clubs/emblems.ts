import {
  Anchor,
  Axe,
  Bird,
  Castle,
  Cat,
  Cherry,
  Club,
  Clover,
  Coins,
  Compass,
  Crown,
  Diamond,
  Dices,
  Feather,
  Flame,
  Gem,
  Ghost,
  Heart,
  Hourglass,
  Infinity as InfinityIcon,
  KeyRound,
  Martini,
  Medal,
  Moon,
  Mountain,
  Rocket,
  Sailboat,
  Shield,
  Skull,
  Snowflake,
  Spade,
  Star,
  Sun,
  Swords,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * The emblems a club may wear on its crest, in the order the picker shows them.
 *
 * Lucide's line icons (ISC licence), the same set the app's buttons are drawn
 * from, set in brass on the club's lacquer. A club stores the key, so the keys
 * are permanent: add to the end, never rename or remove one a club may have
 * chosen.
 */
export const EMBLEMS = [
  ['spade', 'Spade', Spade],
  ['heart', 'Heart', Heart],
  ['diamond', 'Diamond', Diamond],
  ['club', 'Club', Club],
  ['crown', 'Crown', Crown],
  ['gem', 'Gem', Gem],
  ['dice', 'Dice', Dices],
  ['coins', 'Coins', Coins],
  ['trophy', 'Trophy', Trophy],
  ['medal', 'Medal', Medal],
  ['star', 'Star', Star],
  ['flame', 'Flame', Flame],
  ['zap', 'Lightning', Zap],
  ['moon', 'Moon', Moon],
  ['sun', 'Sun', Sun],
  ['snowflake', 'Snowflake', Snowflake],
  ['mountain', 'Mountain', Mountain],
  ['clover', 'Clover', Clover],
  ['cherry', 'Cherries', Cherry],
  ['feather', 'Feather', Feather],
  ['bird', 'Bird', Bird],
  ['cat', 'Cat', Cat],
  ['skull', 'Skull', Skull],
  ['ghost', 'Ghost', Ghost],
  ['anchor', 'Anchor', Anchor],
  ['shield', 'Shield', Shield],
  ['swords', 'Swords', Swords],
  ['axe', 'Axe', Axe],
  ['castle', 'Castle', Castle],
  ['rocket', 'Rocket', Rocket],
  ['sailboat', 'Sailboat', Sailboat],
  ['compass', 'Compass', Compass],
  ['key', 'Key', KeyRound],
  ['martini', 'Martini', Martini],
  ['hourglass', 'Hourglass', Hourglass],
  ['infinity', 'Infinity', InfinityIcon],
] as const satisfies readonly (readonly [string, string, LucideIcon])[]

export type EmblemKey = (typeof EMBLEMS)[number][0]

const BY_KEY = new Map<string, { label: string; Icon: LucideIcon }>(
  EMBLEMS.map(([key, label, Icon]) => [key, { label, Icon }]),
)

/** An emblem by its stored key, or null for a key that is not one. */
export function emblemOf(key: string | null | undefined) {
  return (key && BY_KEY.get(key)) || null
}

/** A key made safe to store: itself if it names an emblem, null otherwise. */
export function cleanEmblem(key: unknown): EmblemKey | null {
  return typeof key === 'string' && BY_KEY.has(key) ? (key as EmblemKey) : null
}
