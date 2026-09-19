import 'server-only'

import { notFound, redirect } from 'next/navigation'

import { ClubError } from './clubs'

/**
 * Turn a club refusal into where the page should go instead.
 *
 * Not a member: to the invite page, which offers to ask. No such club, or an
 * admin screen asked for by a player: nothing here. Anything else is a real
 * error and is left to surface as one.
 */
export function orElse(code: string) {
  return (error: unknown): never => {
    if (error instanceof ClubError) {
      if (error.notMember) redirect(`/c/${code}`)
      if (error.status === 404 || error.status === 403 || error.status === 400) notFound()
    }
    throw error
  }
}
