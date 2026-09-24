# Showdown design system

Showdown is a room, not a page — the Private Salon. A near-black house lit from over the table, a racing-green felt inside a near-black rail with a champagne inlay, and exactly one accent — champagne, still named `brass` in the tokens — reserved for the things that cost you something. The felt is the brightest surface in the room after the faces of the playing cards, which is what lets the scheme sit this dark without going murky.

## How to use this

- Link the one stylesheet from every page — `<link rel="stylesheet" href="styles.css">` (adjust the relative path) — and take every colour, font, space, radius and shadow from its variables (`var(--color-*)`, `var(--font-*)`, `var(--space-*)`, `var(--radius-*)`, `var(--shadow-*)`). Never hard-code a colour, a font name or a px value the tokens already carry.
- Build with the classes below rather than inventing parallel ones; the component pages are plain HTML, so view source and copy the markup.
- `templates/` holds whole screens a consuming project can copy.
- The system was derived from `theme.json`. To change the look, edit the token block at the top of `styles.css` — every page, the thumbnail and this guide read from it — and keep `theme.json` and the written guidance in step so they don't drift from what the CSS actually does.

## Direction

One lit stage with the chrome pushed to its edges. The room runs to every edge of the viewport and the light falls off towards the corners, so the whole screen is a single surface rather than a lit oval floating on a flat background. Objects on that surface are *milled*: a shadow beneath and a lit brass hairline along the top edge (`--shadow-md, --edge`), because on a dark ground a shadow alone is invisible and a flat translucent rectangle reads as a smudge. Anything set *into* a panel — inputs, lists, the history log — is a `.well` instead: recessed, unlit, no edge.

## Color

A near-black ground (`--color-bg`) carrying the faintest green, so the surround belongs to the cloth rather than sitting behind it as a neutral. Brass (`--color-accent`) is the only accent, and a signal red (`--color-accent-2`) is reserved for danger states. Each role carries a 100–900 ramp built in OKLCH on a shared perceptual lightness scale, so the same step of any ramp has the same visual weight. Use the light steps (100–300) for text on tinted fills and for gleams, 500 as the base, and the dark steps (700–900) for fills, pressed states and recesses.

The neutral ramp is cool and barely tinted, and it has to stay that way. A warm neutral is the near-opposite hue to the felt at a similar lightness, so a panel built from one reads as a patch stuck onto the green rather than an object resting on it.

**Money is ivory** (`--state-healthy`), and a won pot is lit champagne (`--state-win`). A stack is the figure read most often on the table, and printed in a colour it made every plate shout, so colour is kept for the two things that are news: a stack running short takes amber (`--state-medium`) and then coral (`--state-short`), hues that are neither the cloth nor the champagne.

The red suits take `--suit-red`, not the signal red. It is deeper and slightly warmer, and it has the room to be, now that the cloth it lies on is green.

## Play semantics

The three decisions a player makes each have their own colour, on the same moulded key. The key is ClubGG's, sampled pixel by pixel off their Check / Fold key: a pale lip along the top, a dark foot, sides that meet them on the diagonal, and a face that lightens towards the foot.

| Play | Colour | Token |
| --- | --- | --- |
| Fold (and Check / Fold) | ClubGG's red | `--play-fold` |
| Check / Call | Green — staying in without paying | `--play-pass` |
| Bet / Raise / All-in | Gold — the one that moves chips | `--play-commit` |

The tokens are the key faces. The rest of each key (lip, sides, foot, seams) is set on its `.play-*` class. Next hand is the gold key too, with its countdown sweeping the face. The primary button elsewhere in the system is still brass, for the same reason the commit key is gold: it is always the action that costs something.

## Type

Bodoni Moda for the house lettering and the italic monogram on every seat, Hanken Grotesk for anything read while deciding and for every figure that is money, and Oswald for card ranks alone. The three never trade jobs. Card ranks are tall and condensed so a card is read by its shape from across the table. Money is tabular and lining, so figures do not dance as chips move, without the terminal look of a monospace. The wordmark is `.wordmark`: ivory warming to champagne, clipped to the letterforms.

## Motion

Every duration is a physical claim: dealing is quick and light (`--dur-deal`), chips have weight and overshoot slightly as they land (`--dur-wager`), and the pot takes its time crossing the felt (`--dur-award`) because that journey is the only thing a changing number cannot tell you. Under `prefers-reduced-motion` all of it drops, and anything that *ends* on nothing — a pot in flight, a fading banner — is removed rather than frozen, so it cannot be stranded on screen.

## Components

| Class | What it is | Shown in |
| --- | --- | --- |
| `.btn` with `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon`, `.btn-block` | Actions — the primary is the one struck-brass object | components/buttons.html |
| `.play` with `.play-fold`, `.play-pass`, `.play-commit`; `.play-countdown` + `.play-fill` | The three plays as moulded keys, and Next hand with its countdown | components/buttons.html |
| `.action-dock` with `.dock-sizing` (`.dock-key`, `.dock-amount`, `.dock-slider`) and `.dock-plays`; `.dock-key.dock-icon` | The dock: pot keys, the amount and a slider over the three plays, with the hand-log icons beside it | components/action-bar.html |
| `.tag` with `.tag-accent`, `.tag-danger`, `.tag-mono` | Small labels — blinds, street, status | components/buttons.html |
| `.card-face` with `.card-red`, `.card-back`, `.card-xs/-sm/-lg`, `.card-slot`, `.hand-folded` | Playing cards — paper, the only light surface | components/playing-cards.html |
| `.chip` with `.chip-1/-5/-25/-100/-500/-1000` | Chips — denominations, never decoration | components/chips.html |
| `.seat` (`.seat-out`) + `.seat-cards`, `.seat-plate` (`.seat-acting`, `.seat-winner`), `.seat-avatar`, `.seat-stack`, `.seat-name`, `.dealer-button`, `.callout` | One seat at the table, as one object. `.seat-cards` is a slot holding **either** the cards or the player's face, never both | components/seat.html |
| `.stack-healthy`, `.stack-medium`, `.stack-short` | What a stack is worth, read at a glance | components/seat.html |
| `.panel`, `.panel-lg`, `.panel-row`, `.well` | Milled slabs, and the recesses set into them | components/panels.html |
| `.field` + `.input`, `.seg` + `.seg-opt`, `.slider` + `.slider-range/-thumb/-bubble` | Native form elements, themed states, no script | components/forms.html |
| `.dialog-backdrop` + `.dialog` (`.dialog-head`, `.dialog-body`) | A modal — the answer brought to the table | components/dialog.html |
| `.room`, `.rail`, `.felt`, `.felt-mark` | The stage itself | templates/table/index.html |
| `.wordmark`, `.money`, `.eyebrow`, `.muted` | The type roles | foundations/type.html |

States are built in: hovers step the surface ramp and warm the border to brass, keyboard focus is a 2px brass `:focus-visible` ring, `::selection` is a brass tint, and disabled controls drop to 45%. Don't restyle them per page.

## Do

- Give every raised object both halves of elevation: the shadow and the brass edge.
- Say whose turn it is on the **felt**, not only on the plate — a tinted border is the same weight as every other border on a busy table.
- Reserve height for anything that can appear and disappear at a seat, so a bot acting never nudges the table under the pointer.
- Keep the action bar mounted and dimmed between turns rather than swapping it for a message; replacing it collapses the row on every opponent action.
- Size a bet in the row above the plays: the four pot keys size a real pot raise (measured from the level you would call to), the amount can be typed, and a desktop gets the slider. On a phone the slider goes, so the dock stays two rows — the table pays for every pixel of height the dock takes.
- Read hands back over the table — a sheet on a phone, a dialog on a desktop — rather than on a page that takes the player out of the game.

## Don't

- Do not make a card back red, or tint a card face. Counting an opponent's cards across the felt is the whole job of a face-down card.
- Do not re-tint chips to suit a screen — the colours are denominations and players already read them.
- Do not fade cards individually; fade the hand (`.hand-folded`). Overlapping translucent cards show through one another and double up where they cross.
- Do not use green for anything that is not money, and do not introduce a second accent.
- Do not build a panel as a flat translucent rectangle over the felt.

## Files

- `styles.css` — the only stylesheet: the token block plus the component layer. Link it from every page.
- `readme.md` — this guide.
- `theme.json` — the parameters the system was derived from.
- `thumbnail.html` — the project cover.
- `foundations/color.html` — roles, ramps, the table palette and the play semantics.
- `foundations/type.html` — the three voices and the scale at real sizes.
- `foundations/layout.html` — spacing, radii, elevation and the motion tokens.
- `components/buttons.html` — buttons, the three plays as keys, and tags.
- `components/playing-cards.html` — cards in every size, the house back, and the rules for them.
- `components/chips.html` — denominations, stacks, wagers and the pot.
- `components/seat.html` — a seat resting, to act, winning and folded.
- `components/action-bar.html` — the dock facing a bet, checked to, between turns, and the Next hand key.
- `components/panels.html` — panels, rows and wells.
- `components/forms.html` — inputs, the segmented control and one-tap choices.
- `components/dialog.html` — the rankings chart as a modal over the felt.
- `templates/table/index.html` — the whole table screen.
- `templates/lobby/index.html` — the lobby, with the fanned hand over the panel.
