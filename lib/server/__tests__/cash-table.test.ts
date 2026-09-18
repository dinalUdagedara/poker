import { describe, expect, it } from 'vitest'

import { legalActions, potSize } from '../../poker/state-machine'
import {
  act,
  BROKE_MS,
  CashTableError,
  chairOf,
  disband,
  engineId,
  extend,
  handLive,
  liveStack,
  NEXT_HAND_MS,
  openCashTable,
  resolveCashSettings,
  SIT_OUT_MS,
  sitDown,
  sitIn,
  sitOut,
  standUp,
  tick,
  TIMEOUT_GRACE_MS,
  type CashTable,
} from '../cash-table'

const HOUR = 60 * 60_000
const T0 = 1_000_000

const SETTINGS = resolveCashSettings({
  seatCount: 6,
  smallBlind: 50,
  bigBlind: 100,
  minBuyIn: 1_000,
  maxBuyIn: 10_000,
  actionSeconds: 15,
  autoStart: 2,
})

function open(overrides: Partial<Parameters<typeof resolveCashSettings>[0]> = {}): CashTable {
  const settings = Object.keys(overrides).length
    ? resolveCashSettings({
        seatCount: 6,
        smallBlind: 50,
        bigBlind: 100,
        minBuyIn: 1_000,
        maxBuyIn: 10_000,
        actionSeconds: 15,
        ...overrides,
      })
    : SETTINGS
  return openCashTable({ tableId: 'table-1', name: 'Friday', clubId: null, settings, closesAt: T0 + 12 * HOUR, now: T0 })
}

let session = 0
function sit(table: CashTable, playerId: string, buyIn = 2_000, now = T0, chair?: number): CashTable {
  return sitDown(table, { playerId, name: playerId, lacquer: null, buyIn, sessionId: `session-${++session}`, chair }, now)
}

/** Whose turn it is, as a player id. */
function acting(table: CashTable): string | null {
  const id = table.hand?.actingPlayerId
  if (!id || !handLive(table)) return null
  return table.seats[Number(id.slice(1))]?.playerId ?? null
}

/** Call or check for whoever is to act. */
function flat(table: CashTable, now: number): CashTable {
  const legal = legalActions(table.hand!)!
  return act(table, acting(table)!, legal.canCheck ? { type: 'check' } : { type: 'call' }, now)
}

/** Play the hand out by checking and calling, returning the settled table. */
function playOut(table: CashTable, now: number): CashTable {
  let next = table
  for (let guard = 0; handLive(next) && guard < 100; guard++) next = flat(next, now)
  return next
}

/**
 * Every chip accounted for: what is in front of the players, what is in a live
 * pot, and what has been paid out, together equal what was bought in.
 */
function chipsOnBooks(table: CashTable): number {
  const inFront = table.seats.reduce((total, _seat, chair) => total + liveStack(table, chair), 0)
  const inPot = handLive(table) ? potSize(table.hand!) : 0
  const paidOut = table.cashOuts.reduce((total, cashOut) => total + cashOut.amount, 0)
  return inFront + inPot + paidOut
}

function refusal(run: () => unknown): CashTableError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(CashTableError)
    return error as CashTableError
  }
  throw new Error('expected a refusal')
}

describe('settings', () => {
  it('turns seconds into milliseconds and defaults auto-start to two', () => {
    expect(SETTINGS).toMatchObject({ actionMs: 15_000, autoStart: 2, bigBlind: 100 })
  })

  it('refuses a buy-in floor under ten big blinds, and a range out of order', () => {
    expect(() => resolveCashSettings({ ...SETTINGS, actionSeconds: 15, minBuyIn: 900 })).toThrow(CashTableError)
    expect(() => resolveCashSettings({ ...SETTINGS, actionSeconds: 15, maxBuyIn: 999 })).toThrow(CashTableError)
  })

  it('refuses an action time ClubGG does not offer', () => {
    expect(() => resolveCashSettings({ ...SETTINGS, actionSeconds: 14 })).toThrow(CashTableError)
  })
})

describe('sitting down', () => {
  it('waits for the auto-start count before the first deal', () => {
    let table = open({ autoStart: 3 })
    table = sit(table, 'ana')
    table = sit(table, 'bo')
    expect(table.hand).toBeNull()
    table = sit(table, 'cy')
    expect(handLive(table)).toBe(true)
  })

  it('deals as soon as two are sitting at a table that starts with two', () => {
    let table = sit(open(), 'ana')
    expect(table.hand).toBeNull()
    table = sit(table, 'bo')
    expect(handLive(table)).toBe(true)
    expect(table.hand!.bigBlind).toBe(100)
  })

  it('refuses a buy-in outside the range, a taken chair, a second chair, and a full table', () => {
    let table = sit(open({ seatCount: 2 }), 'ana', 2_000, T0, 0)
    expect(refusal(() => sit(table, 'bo', 999)).status).toBe(400)
    expect(refusal(() => sit(table, 'bo', 10_001)).status).toBe(400)
    expect(refusal(() => sit(table, 'bo', 2_000, T0, 0)).status).toBe(409)
    expect(refusal(() => sit(table, 'ana')).status).toBe(409)
    table = sit(table, 'bo')
    expect(refusal(() => sit(table, 'cy')).status).toBe(409)
  })

  it('seats a latecomer now and deals them into the next hand', () => {
    let table = sit(sit(open(), 'ana'), 'bo')
    table = sit(table, 'cy')
    expect(table.hand!.players.map((p) => p.id)).not.toContain(engineId(chairOf(table, 'cy')))

    table = tick(playOut(table, T0), T0 + NEXT_HAND_MS)
    expect(table.hand!.handNumber).toBe(2)
    expect(table.hand!.players.map((p) => p.id)).toContain(engineId(chairOf(table, 'cy')))
  })
})

describe('the deal', () => {
  it('keeps the blinds fixed and moves the button', () => {
    let table = sit(sit(sit(open(), 'ana'), 'bo'), 'cy')
    const buttons: number[] = []
    let now = T0
    for (let i = 0; i < 4; i++) {
      buttons.push(table.hand!.buttonSeat)
      expect(table.hand!.smallBlind).toBe(50)
      expect(table.hand!.bigBlind).toBe(100)
      now += NEXT_HAND_MS
      table = tick(playOut(table, now), now + NEXT_HAND_MS)
      now += NEXT_HAND_MS
    }
    expect(new Set(buttons).size).toBeGreaterThan(1)
  })

  it('leaves the result on the felt for a moment before dealing again', () => {
    const table = playOut(sit(sit(open(), 'ana'), 'bo'), T0)
    expect(table.hand!.result).not.toBeNull()
    expect(tick(table, T0 + NEXT_HAND_MS - 1)).toBe(table)
    expect(tick(table, T0 + NEXT_HAND_MS).hand!.handNumber).toBe(2)
  })

  it('does not change a table that has nothing due', () => {
    const table = sit(sit(open(), 'ana'), 'bo')
    expect(tick(table, T0 + 1_000)).toBe(table)
  })
})

describe('standing up', () => {
  it('pays out at once between hands', () => {
    let table = sit(open(), 'ana', 3_000)
    table = standUp(table, 'ana', T0)
    expect(chairOf(table, 'ana')).toBe(-1)
    expect(table.cashOuts).toEqual([expect.objectContaining({ playerId: 'ana', amount: 3_000 })])
  })

  it('waits for the hand to end, folding for the player meanwhile', () => {
    // Three dealt in, so the leaver folding does not end the hand by itself.
    let table = sit(sit(sit(open({ autoStart: 3 }), 'ana'), 'bo'), 'cy')
    const leaver = acting(table)!
    table = standUp(table, leaver, T0)

    // Their turn was taken for them straight away, and the hand went on.
    expect(acting(table)).not.toBe(leaver)
    expect(chairOf(table, leaver)).not.toBe(-1)

    table = playOut(table, T0)
    expect(chairOf(table, leaver)).toBe(-1)
    const [cashOut] = table.cashOuts
    expect(cashOut.playerId).toBe(leaver)
    expect(cashOut.amount).toBeGreaterThan(0)
    expect(chipsOnBooks(table)).toBe(6_000)
  })
})

describe('sitting out and timing out', () => {
  it('sits a player out from the next hand when asked mid-hand, and back in on request', () => {
    let table = sit(sit(sit(open({ autoStart: 3 }), 'ana'), 'bo'), 'cy')
    table = sitOut(table, 'cy', T0)
    table = tick(playOut(table, T0), T0 + NEXT_HAND_MS)
    const cy = engineId(chairOf(table, 'cy'))
    expect(table.hand!.players.map((p) => p.id)).not.toContain(cy)

    table = sitIn(table, 'cy', T0 + NEXT_HAND_MS)
    table = tick(playOut(table, T0 + NEXT_HAND_MS), T0 + 3 * NEXT_HAND_MS)
    expect(table.hand!.players.map((p) => p.id)).toContain(cy)
  })

  it('acts for a player who runs out of time and sits them out', () => {
    let table = sit(sit(sit(open({ autoStart: 3 }), 'ana'), 'bo'), 'cy')
    const slow = acting(table)!
    table = tick(table, T0 + 15_000)
    expect(acting(table)).not.toBe(slow)
    expect(table.seats[chairOf(table, slow)]).toMatchObject({ status: 'sitting-out', satOutReason: 'timeout' })
  })

  it('stands up a timed-out player who does not come back', () => {
    let table = sit(sit(sit(open({ autoStart: 3 }), 'ana'), 'bo'), 'cy')
    const slow = acting(table)!
    table = tick(table, T0 + 15_000)
    table = playOut(table, T0 + 15_000)
    expect(chairOf(table, slow)).not.toBe(-1)
    table = tick(table, T0 + 15_000 + TIMEOUT_GRACE_MS)
    expect(chairOf(table, slow)).toBe(-1)
    expect(table.cashOuts.map((c) => c.playerId)).toContain(slow)
  })

  it('holds a chosen sit-out for ten minutes', () => {
    let table = sit(open(), 'ana')
    table = sitOut(table, 'ana', T0)
    expect(chairOf(tick(table, T0 + SIT_OUT_MS - 1), 'ana')).not.toBe(-1)
    expect(chairOf(tick(table, T0 + SIT_OUT_MS), 'ana')).toBe(-1)
  })

  it('sits out a player who has lost everything, and stands them up if they do not top up', () => {
    // Set up the moment a hand ends with Ana's last chip gone to Bo, rather than
    // playing hands until the cards happen to do it.
    const dealt = sit(sit(open(), 'ana', 1_000), 'bo', 10_000)
    const ana = engineId(chairOf(dealt, 'ana'))
    const hand = dealt.hand!
    const finished: CashTable = {
      ...dealt,
      hand: {
        ...hand,
        players: hand.players.map((p) => ({ ...p, stack: p.id === ana ? 0 : 11_000, currentBet: 0 })),
        actingPlayerId: null,
        result: { ...(hand.result ?? {}), showdown: false } as NonNullable<typeof hand.result>,
      },
    }

    let table = tick(finished, T0)
    expect(table.seats[chairOf(table, 'ana')]).toMatchObject({ stack: 0, status: 'sitting-out', satOutReason: 'broke' })
    expect(chipsOnBooks(table)).toBe(11_000)

    // No chips, so no coming back in without topping up first.
    expect(refusal(() => sitIn(table, 'ana', T0)).status).toBe(409)
    // And no hand for Bo alone.
    expect(tick(table, T0 + NEXT_HAND_MS).hand!.handNumber).toBe(1)

    table = tick(table, T0 + BROKE_MS)
    expect(chairOf(table, 'ana')).toBe(-1)
    expect(table.cashOuts).toEqual([expect.objectContaining({ playerId: 'ana', amount: 0 })])
    expect(chipsOnBooks(table)).toBe(11_000)
  })
})

describe('closing', () => {
  it('lets the hand in progress finish, then stands everyone up and deals no more', () => {
    let table = sit(sit(open(), 'ana'), 'bo')
    table = tick(table, T0 + 12 * HOUR - 1)
    const closing = tick(table, T0 + 12 * HOUR)
    // The clock ran the hand out, but a table never closes on a live hand.
    expect(closing.closed).toBe(closing.hand!.result !== null)
    const closed = tick(playOut(closing, T0 + 12 * HOUR), T0 + 12 * HOUR + NEXT_HAND_MS)
    expect(closed.closed).toBe(true)
    expect(closed.seats.every((seat) => seat === null)).toBe(true)
    expect(closed.cashOuts).toHaveLength(2)
    expect(chipsOnBooks(closed)).toBe(4_000)
    expect(refusal(() => sit(closed, 'cy')).status).toBe(409)
  })

  it('closes on disband once the hand ends', () => {
    let table = sit(sit(open(), 'ana'), 'bo')
    table = disband(table, T0)
    expect(table.closed).toBe(false)
    table = playOut(table, T0)
    expect(table.closed).toBe(true)
    expect(chipsOnBooks(table)).toBe(4_000)
  })

  it('can be given longer', () => {
    const table = extend(open(), 2 * HOUR, T0)
    expect(table.closesAt).toBe(T0 + 14 * HOUR)
  })
})

describe('chips are never made or lost', () => {
  /** A small deterministic random source, so a failure can be replayed. */
  function random(seed: number) {
    let state = seed
    return () => {
      state = (state * 1_103_515_245 + 12_345) % 2 ** 31
      return state / 2 ** 31
    }
  }

  it.each([1, 2, 3, 4, 5])('across a long random evening (seed %i)', (seed) => {
    const rand = random(seed)
    const players = ['ana', 'bo', 'cy', 'di', 'ed', 'fi', 'gu']
    let table = open()
    let now = T0
    let boughtIn = 0

    for (let step = 0; step < 1_500 && !table.closed; step++) {
      now += Math.floor(rand() * 6_000)
      const who = players[Math.floor(rand() * players.length)]
      const roll = rand()

      try {
        if (roll < 0.08 && chairOf(table, who) === -1) {
          const buyIn = 1_000 + Math.floor(rand() * 9_000)
          table = sit(table, who, buyIn, now)
          boughtIn += buyIn
        } else if (roll < 0.11 && chairOf(table, who) !== -1) {
          table = standUp(table, who, now)
        } else if (roll < 0.14 && chairOf(table, who) !== -1) {
          table = rand() < 0.5 ? sitOut(table, who, now) : sitIn(table, who, now)
        } else if (handLive(table) && acting(table)) {
          const legal = legalActions(table.hand!)!
          const pick = rand()
          const player = acting(table)!
          table =
            pick < 0.15
              ? act(table, player, { type: 'fold' }, now)
              : pick < 0.3 && legal.raise
                ? act(table, player, { type: 'raise', amount: legal.raise.min }, now)
                : pick < 0.35 && legal.bet
                  ? act(table, player, { type: 'bet', amount: legal.bet.max }, now)
                  : flat(table, now)
        } else {
          table = tick(table, now)
        }
      } catch (error) {
        // A refused request changes nothing; anything else is a real failure.
        if (!(error instanceof CashTableError)) throw error
      }

      expect(chipsOnBooks(table)).toBe(boughtIn)
      for (const seat of table.seats) if (seat) expect(seat.stack).toBeGreaterThanOrEqual(0)
    }

    table = tick(disband(table, now), now)
    for (let guard = 0; handLive(table) && guard < 100; guard++) table = flat(table, now)
    table = tick(table, now)
    expect(table.closed).toBe(true)
    expect(table.cashOuts.reduce((total, c) => total + c.amount, 0)).toBe(boughtIn)
    // Every sitting is paid out exactly once.
    expect(new Set(table.cashOuts.map((c) => c.sessionId)).size).toBe(table.cashOuts.length)
  })
})
