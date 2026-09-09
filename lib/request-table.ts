/**
 * Open a table through the public API and return its id.
 *
 * The lobby and the rooms page both deal this way; keeping the request in one
 * place stops the two screens from drifting on the body they send.
 */
export async function requestTable(body: {
  botCount?: number
  seatCount?: number
  isPublic?: boolean
}): Promise<string> {
  const response = await fetch('/api/table', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? 'Could not start a table')
  return payload.tableId as string
}
