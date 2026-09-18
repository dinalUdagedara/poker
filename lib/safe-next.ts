/**
 * Where to go after signing in, taken from a `?next=` parameter.
 *
 * Only a path on this site is accepted. Anything else — a full URL, or `//evil`,
 * which a browser reads as another host — falls back to the default, so a link
 * built by someone else cannot use our sign-in page to send people elsewhere.
 */
export function safeNext(next: unknown, fallback = '/clubs'): string {
  if (typeof next !== 'string') return fallback
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
