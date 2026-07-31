'use client'

import { useEffect, useRef } from 'react'
import type { AnyTableView } from '@/lib/poker/lifecycle'

/**
 * Follow a table without asking for it.
 *
 * The connection is the client's only job here — what arrives is already
 * redacted for whoever holds the cookie, because the server builds a separate
 * view per subscriber.
 *
 * `EventSource` reconnects on its own, which matters more than it sounds: the
 * server's stream is cut whenever the platform's function timeout expires, so
 * reconnecting is the normal course of events rather than an error path.
 */
export function useTableStream(
  tableId: string,
  onTable: (view: AnyTableView) => void,
  onGone?: () => void,
) {
  // The handlers live in refs so that a parent re-rendering — which it does on
  // every update this hook delivers — does not tear the connection down and
  // open a new one. Only the table id may do that.
  const handlers = useRef({ onTable, onGone })

  useEffect(() => {
    handlers.current = { onTable, onGone }
  })

  useEffect(() => {
    const source = new EventSource(`/api/table/${tableId}/stream`)

    source.addEventListener('table', (event) => {
      handlers.current.onTable(JSON.parse((event as MessageEvent).data) as AnyTableView)
    })

    source.addEventListener('gone', () => {
      source.close()
      handlers.current.onGone?.()
    })

    return () => source.close()
  }, [tableId])
}
