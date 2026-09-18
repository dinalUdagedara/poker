/**
 * What an account shows other people, shared by the server and the browser.
 */

/**
 * The lacquer a monogram is set on, as hues.
 *
 * Jewel tones held dark and quiet — emerald, oxblood, sapphire, aubergine,
 * tobacco, teal — so a seat looks engraved rather than printed. Every one sits
 * at the same lightness and chroma, so no player's face is louder than another
 * and the gold lettering has the same contrast on all of them.
 *
 * An account's avatar is an index into this list. A guest has none and is given
 * one from their id, which is how every seat was coloured before accounts.
 */
export const LACQUER_HUES = [158, 25, 262, 322, 55, 205] as const

export const LACQUER_NAMES = ['Emerald', 'Oxblood', 'Sapphire', 'Aubergine', 'Tobacco', 'Teal'] as const

export const AVATAR_COUNT = LACQUER_HUES.length

/** `48210937` as `4821-0937`: the way an id is read aloud and typed. */
export function formatPublicId(publicId: string): string {
  return publicId.length === 8 ? `${publicId.slice(0, 4)}-${publicId.slice(4)}` : publicId
}

/** The avatar index an account stored, or null if it has none or it is out of range. */
export function lacquerOf(avatar: string | null | undefined): number | null {
  const index = Number(avatar)
  return avatar != null && Number.isInteger(index) && index >= 0 && index < AVATAR_COUNT ? index : null
}
