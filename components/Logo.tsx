import Image from 'next/image'

/** The crest's own proportions, so a caller only ever has to set a height. */
const INTRINSIC = { width: 449, height: 501 }

/**
 * The house crest.
 *
 * Rendered from `public/mark.png`, which is `assets/logo-crest.png` lifted off
 * the flat plate it was drawn on — see `scripts/build-icons.py`. The app icons
 * come from the same master, so the tab, the home screen and the header are all
 * the same mark rather than three drawings of it.
 *
 * It is cut for a dark ground and nothing else. The interior of the diamond is
 * transparent rather than filled, so the surface behind shows through the way
 * it does on the felt; over a light background the whole crest washes out. That
 * is not a limitation worth designing around here — `layout.tsx` pins the app
 * to one dark theme, because the felt and the white card faces both depend on
 * the surround staying dark.
 *
 * `alt` is empty on purpose. This is only ever shown beside the wordmark
 * saying the same word, and a screen reader gets more from the text than from
 * hearing the house name twice.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/mark.png"
      alt=""
      width={INTRINSIC.width}
      height={INTRINSIC.height}
      className={className}
      // The mark is above the fold on every route it appears on, so waiting for
      // it to scroll into view only buys a flash of empty space beside the name.
      priority
    />
  )
}
