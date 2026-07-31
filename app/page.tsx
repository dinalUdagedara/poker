import { HomePanel } from '@/components/HomePanel'

/**
 * The lobby.
 *
 * Which tab opens can be asked for in the address — `/?play=people` is how the
 * empty-rooms screen sends someone here to open one, since landing them on
 * Practice would answer a different question than the one they asked.
 *
 * Read here rather than in the panel so the page still renders its content on
 * the server. Doing it in the client would need a Suspense boundary that
 * cannot prerender, and the page would arrive empty.
 */
export default async function Home({ searchParams }: PageProps<'/'>) {
  const { play } = await searchParams

  return <HomePanel initialTab={play === 'people' ? 'people' : 'practice'} />
}
