/**
 * The table as ClubGG draws it: a still, not a mesh.
 *
 * One pose for a phone (the oval stands up) and one for a wide screen (the 2:1
 * felt). Seats, cards and chips stay 2D on top — that is the same split their
 * Unity client uses, and it is why the nameplates stay readable.
 */
export function TableBody() {
  return (
    <picture className="table-body" aria-hidden>
      <source media="(min-width: 640px)" srcSet="/table-desktop.png" />
      <img src="/table-mobile.png" alt="" draggable={false} />
    </picture>
  )
}
