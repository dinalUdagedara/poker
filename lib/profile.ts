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

/** How many pictures the gallery offers (`public/avatars/notionists/01…NN.svg`). */
export const PICTURE_COUNT = 30

/**
 * What an account shows as its face, parsed from the one string it stores.
 *
 * - `"3"`     — its initials on lacquer 3, the monogram every seat began with;
 * - `"p12"`   — gallery picture 12 on ivory;
 * - `"p12.3"` — gallery picture 12 on lacquer 3.
 *
 * One string rather than two columns, so the choice travels wherever the old
 * lacquer did and existing accounts need nothing done to them.
 */
export type Face = { lacquer: number | null; picture: number | null }

const inRange = (n: number, count: number) => Number.isInteger(n) && n >= 0 && n < count

export function faceOf(avatar: string | null | undefined): Face {
  if (avatar == null) return { lacquer: null, picture: null }
  const picture = /^p(\d{1,2})(?:\.(\d))?$/.exec(avatar)
  if (picture) {
    const number = Number(picture[1])
    const lacquer = picture[2] === undefined ? null : Number(picture[2])
    if (number < 1 || number > PICTURE_COUNT) return { lacquer: null, picture: null }
    return { picture: number, lacquer: lacquer !== null && inRange(lacquer, AVATAR_COUNT) ? lacquer : null }
  }
  const lacquer = Number(avatar)
  return { lacquer: /^\d$/.test(avatar) && inRange(lacquer, AVATAR_COUNT) ? lacquer : null, picture: null }
}

/** The string to store for a face, or null for one that is not allowed. */
export function avatarOf(face: Face): string | null {
  if (face.picture !== null) {
    if (!Number.isInteger(face.picture) || face.picture < 1 || face.picture > PICTURE_COUNT) return null
    if (face.lacquer === null) return `p${face.picture}`
    return inRange(face.lacquer, AVATAR_COUNT) ? `p${face.picture}.${face.lacquer}` : null
  }
  return face.lacquer !== null && inRange(face.lacquer, AVATAR_COUNT) ? String(face.lacquer) : null
}

/**
 * A stored avatar made safe: the same string if it is exactly an allowed one,
 * else null. Exactly — `p3.6` names a lacquer that does not exist, and is
 * refused rather than quietly read as `p3`.
 */
export function cleanAvatar(avatar: unknown): string | null {
  if (typeof avatar !== 'string') return null
  return avatarOf(faceOf(avatar)) === avatar ? avatar : null
}

/** Where a gallery picture is served from. */
export function pictureUrl(picture: number): string {
  return `/avatars/notionists/${String(picture).padStart(2, '0')}.svg`
}

/** The lacquer an account chose, whether behind its initials or its picture. */
export function lacquerOf(avatar: string | null | undefined): number | null {
  return faceOf(avatar).lacquer
}

/** The gallery picture an account chose, or null for the monogram. */
export function pictureOf(avatar: string | null | undefined): number | null {
  return faceOf(avatar).picture
}
