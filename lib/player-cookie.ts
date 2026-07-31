/**
 * The cookie carrying the player id.
 *
 * Its own module because two runtimes need the name: `proxy.ts`, which mints
 * the id and runs before the server does, and `lib/server/player.ts`, which
 * reads it. The proxy runtime cannot import a `server-only` module, so the
 * constant cannot live with the reader.
 */
export const PLAYER_COOKIE = 'pid'

/**
 * The cookie carrying a chosen display name.
 *
 * Deliberately readable and writable by the page: a name is decoration, it
 * identifies nobody, and making the browser ask the server to set it would buy
 * nothing.
 */
export const NAME_COOKIE = 'pname'
