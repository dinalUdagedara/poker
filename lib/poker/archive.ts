/**
 * Hands that have already been played, arranged the way they are read back.
 *
 * A hand is settled and then immediately overwritten — `startHand` builds a
 * fresh history and the next deal replaces the state it was in. Everything
 * needed to reconstruct it is in that state, so nothing here re-derives
 * anything: this module only says how a finished hand is shaped for a reader
 * and how its actions divide into the columns a player expects to see.
 *
 * Pure, and free of anything server-only, because the same grouping runs in the
 * browser that draws it.
 */

import { annotateHistory, type AnnotatedEntry } from "./callouts";
import type { RedactedTableState } from "./redact";
import type { HistoryEntry, Street } from "./types";

/**
 * A finished hand as one of the people at the table is allowed to see it.
 *
 * A redacted state and nothing more, because a hand that is over is still a
 * hand somebody may not be entitled to see every card of: a pot won by a fold
 * never showed, and it must not start showing an hour later just because it is
 * being read from history rather than from the table. `redactFor` already
 * decides that from `result.shownHands`, so replaying an archived state through
 * it is both the simplest implementation and the one already under test.
 */
export type HandView = RedactedTableState & {
  /** When the hand finished, as a timestamp. */
  endedAt: number;
  /**
   * What to call each seat, by engine seat id, as it was at the time.
   *
   * Snapshotted rather than read from the live table, so a hand stays legible
   * after the players who were in it have renamed themselves or left.
   */
  names: Record<string, string>;
};

/**
 * One column of a hand: a heading, the pot it opened with, and what happened.
 *
 * The blinds are their own column rather than the head of pre-flop. They are
 * posted money and not a decision, and running them together makes the first
 * column read as though two players opened by calling.
 */
export type HandSection = {
  street: Street;
  label: string;
  /** The pot as it stood before any of this column's actions. */
  potBefore: number;
  entries: AnnotatedEntry[];
};

const STREETS: { street: Street; label: string; cardsOut: number }[] = [
  { street: "preflop", label: "Pre-Flop", cardsOut: 0 },
  { street: "flop", label: "Flop", cardsOut: 3 },
  { street: "turn", label: "Turn", cardsOut: 4 },
  { street: "river", label: "River", cardsOut: 5 },
];

/**
 * Divide a finished hand into the columns it is read in.
 *
 * `communityCards` is what decides whether a street with no actions in it is
 * still shown. Two players all-in pre-flop produce a hand whose flop, turn and
 * river hold no entries at all, and dropping those columns would tell the
 * reader the hand ended pre-flop when in fact the board ran out — so a street
 * appears if anybody acted on it *or* if its card was dealt.
 */
export function sectionsOf(
  handHistory: HistoryEntry[],
  communityCards: number,
): HandSection[] {
  const annotated = annotateHistory(handHistory);
  const sections: HandSection[] = [];

  // Chips are counted as the columns are built rather than summed per column,
  // because what heads a column is the pot it *opened* with — the money already
  // in front of the first player to act, which is every entry before it.
  let pot = 0;
  const take = (street: Street, label: string, entries: AnnotatedEntry[]) => {
    sections.push({ street, label, potBefore: pot, entries });
    for (const entry of entries) pot += entry.amount;
  };

  const blinds = annotated.filter((entry) => entry.type === "post-blind");
  if (blinds.length > 0) take("preflop", "Blinds", blinds);

  for (const { street, label, cardsOut } of STREETS) {
    const entries = annotated.filter(
      (entry) => entry.street === street && entry.type !== "post-blind",
    );
    if (entries.length > 0 || communityCards >= cardsOut)
      take(street, label, entries);
  }

  return sections;
}

/**
 * Which seat was on the button and in the blinds, by player id.
 *
 * Read back from the blinds that were actually posted rather than recomputed
 * from where people are sitting. The engine works the blinds out from the live
 * seats at the moment it deals, and by the end of a hand those have moved —
 * players have folded and busted — so recomputing would quietly hand the
 * badges to the wrong chairs. The order is the definition: the small blind is
 * posted first.
 *
 * Heads-up the button posts the small blind and so is labelled SB, which is
 * the label that matters at a two-handed table.
 */
export function positionsOf(
  hand: Pick<RedactedTableState, "handHistory" | "players" | "buttonSeat">,
): Map<string, string> {
  const positions = new Map<string, string>();

  const button = hand.players.find((player) => player.seat === hand.buttonSeat);
  if (button) positions.set(button.id, "BTN");

  const blinds = hand.handHistory.filter(
    (entry) => entry.type === "post-blind",
  );
  if (blinds[0]) positions.set(blinds[0].playerId, "SB");
  if (blinds[1]) positions.set(blinds[1].playerId, "BB");

  return positions;
}

/** Every chip that ended up in the middle, which is what the hand was for. */
export function potOf(hand: Pick<RedactedTableState, "handHistory">): number {
  return hand.handHistory.reduce((total, entry) => total + entry.amount, 0);
}
