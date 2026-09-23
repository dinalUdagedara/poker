/**
 * The table as ClubGG draws it: a still, not a mesh.
 *
 * One pose for a phone (the oval stands up) and one for a wide screen (the 2:1
 * felt). Both are the Salon render — `render-table.py --skin salon [--pose
 * mobile]` — which prints its own racing green and the faint champagne line. Seats, cards and chips stay 2D on top — that is the same split their
 * Unity client uses, and it is why the nameplates stay readable.
 *
 * `className` swaps the skin, not the file: the win veil is this same picture
 * flattened to a dim, so the oval cannot drift off the still underneath.
 */
export function TableBody({ className = 'table-body' }: { className?: string }) {
  return (
    <picture className={className} aria-hidden>
      <source media="(min-width: 640px)" srcSet="/table-desktop-salon.png" />
      <img src="/table-mobile.png" alt="" draggable={false} />
    </picture>
  )
}
