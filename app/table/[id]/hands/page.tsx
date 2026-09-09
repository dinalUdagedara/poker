import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HandHistory } from "@/components/HandHistory";
import { currentPlayerId } from "@/lib/server/player";
import { listHands, TableError } from "@/lib/server/table-store";

/**
 * Not indexed, and not unfurled either.
 *
 * A table's own page is a link people paste into a group chat, so it says
 * something inviting to whoever scrapes it. This one is the opposite: it is
 * reached from a table you are already at, and it exists only as long as that
 * table does.
 */
export const metadata: Metadata = {
  title: "Hand history",
  robots: { index: false, follow: false },
};

/**
 * Read on the server, like the table page beside it.
 *
 * `params` is a promise in Next.js 16 — synchronous access was removed. The
 * hands are fetched here rather than by the client after mount for the same
 * reason the table is: it saves a round trip, and the page arrives with the
 * hand on it instead of a spinner.
 *
 * There is no live stream. A finished hand does not change, and the one place
 * new hands come from is the table this page is one tap away from.
 */
export default async function HandHistoryPage({
  params,
}: PageProps<"/table/[id]/hands">) {
  const { id } = await params;

  let hands;
  try {
    hands = await listHands(id, await currentPlayerId());
  } catch (error) {
    // A table that has expired or never existed has no history to show, and
    // the table page it belongs to would answer the same way.
    if (error instanceof TableError && error.status === 404) notFound();
    throw error;
  }

  return <HandHistory tableId={id} hands={hands} />;
}
