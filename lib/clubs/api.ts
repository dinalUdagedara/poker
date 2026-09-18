/**
 * Club requests from the browser, in one place so every screen sends the same
 * shape and reads errors the same way. The server decides everything; a
 * refusal comes back as a message the screen can show as it is.
 */
export async function clubRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/clubs${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'Something went wrong. Try again.')
  return payload as T
}

/** `778589` as `778 589`: easier to read aloud and to copy by eye. */
export function formatClubCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}
