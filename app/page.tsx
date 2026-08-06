import { HomePanel } from '@/components/HomePanel'

/**
 * The lobby.
 *
 * Which screen opens can be asked for in the address — `/?play=people` is how
 * the empty-rooms screen sends someone here to open one, and it now skips the
 * mode picker rather than merely preselecting a tab on it. Somebody who has
 * already said what they want should not be asked again on arrival.
 *
 * Everything else lands on `start`, the fork itself. There is no default way to
 * play: choosing is the first thing the lobby is for.
 *
 * Read here rather than in the panel so the page still renders its content on
 * the server. Doing it in the client would need a Suspense boundary that
 * cannot prerender, and the page would arrive empty.
 */
export default async function Home({ searchParams }: PageProps<'/'>) {
  const { play } = await searchParams

  return <HomePanel initialScreen={play === 'people' ? 'people' : 'start'} />
}
