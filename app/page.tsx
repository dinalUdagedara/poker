import { redirect } from 'next/navigation'
import { HomePanel } from '@/components/HomePanel'

/**
 * Play now.
 *
 * The lobby is the practice table. Sitting with people lives at `/rooms`.
 * `/?play=people` used to open the people view of this card; those links still
 * work, they just go where that view now lives.
 */
export default async function Home({ searchParams }: PageProps<'/'>) {
  const { play } = await searchParams
  if (play === 'people') redirect('/rooms')

  return <HomePanel />
}
