import { describe, expect, it } from 'vitest'
import { calloutPlacement, chipSide, seatOrder, seatRing } from '../table-seating'

/** Nothing may be placed outside the felt it is a percentage of. */
const onFelt = (point: { left: number; top: number }) =>
  point.left >= 0 && point.left <= 100 && point.top >= 0 && point.top <= 100

describe('the ring of seats', () => {
  it('always puts the viewer at the bottom, whatever the field', () => {
    // The one fixed point of the whole layout: you are at the near edge, and
    // everything else is arranged relative to that.
    for (let count = 1; count <= 9; count++) {
      const [first] = seatRing(count)
      expect(first.left).toBeCloseTo(50)
      expect(first.top).toBeGreaterThan(85)
    }
  })

  it('seats the next player to the viewer’s left', () => {
    // Action order runs to your left, so seat 1 has to be on that side. Getting
    // this backwards would deal the blinds round the table the wrong way.
    for (const count of [3, 6, 9]) expect(seatRing(count)[1].left).toBeLessThan(50)
  })

  it('keeps every seat on the felt, at every size and orientation', () => {
    for (let count = 1; count <= 9; count++) {
      expect(seatRing(count).every(onFelt)).toBe(true)
      expect(seatRing(count, true).every(onFelt)).toBe(true)
    }
  })

  it('pulls the seats level with the middle in off the rail', () => {
    // The honest ellipse is right everywhere except its two widest points,
    // where a plate centred on the true point overhangs the wood.
    const level = seatRing(4)[1]
    expect(level.top).toBeCloseTo(50)
    expect(level.left).toBeGreaterThan(50 - 41)
  })

  it('spreads a crowded table without standing two people in one place', () => {
    // Distinct positions are the whole contract: two seats sharing a point is
    // the failure the layout test in the e2e suite exists to catch.
    for (const portrait of [false, true]) {
      const points = seatRing(9, portrait)
      const apart = points.every((a, i) =>
        points.every((b, j) => i === j || Math.hypot(a.left - b.left, a.top - b.top) > 8),
      )
      expect(apart).toBe(true)
    }
  })

  it('stands the ring up for a phone', () => {
    // A portrait felt has height to spare and almost no width, so the same
    // field has to reach further down and sit closer to the sides.
    const [wide, tall] = [seatRing(6)[1], seatRing(6, true)[1]]
    expect(tall.top).toBeGreaterThan(wide.top)
  })

  it('drops the viewer onto the near rail on a phone', () => {
    // A five-card board needs the lower felt. The honest ellipse puts the
    // viewer at the same reach as the top seat, so only the bottom is pushed.
    const [desk, phone] = [seatRing(6)[0], seatRing(6, true)[0]]
    expect(phone.top).toBeGreaterThan(desk.top)
    expect(phone.top).toBeGreaterThan(90)
  })
})

describe('who sits where', () => {
  const players = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

  it('brings the viewer to the front without reordering anyone else', () => {
    // Rotated, not sorted. Seat order is what makes the button pass to the next
    // seat clockwise, so the sequence has to survive being re-anchored.
    expect(seatOrder(players, 'c').map((p) => p.id)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('leaves the table alone for someone who is only watching', () => {
    expect(seatOrder(players, null)).toBe(players)
    expect(seatOrder(players, 'nobody')).toBe(players)
  })
})

describe('where a bubble has room to hang', () => {
  it('sends it outboard, away from the middle', () => {
    // Inboard points every bubble at the board and at the bubble of the seat
    // opposite, which is how six players posting and folding ended up in a heap
    // over the pot.
    expect(calloutPlacement({ left: 14.5, top: 29 })).toBe('above')
    expect(calloutPlacement({ left: 85.5, top: 71 })).toBe('left')
  })

  it('sends the viewer’s sideways, because below them is the console', () => {
    expect(calloutPlacement({ left: 50, top: 92 })).toBe('right')
  })

  it('sends a seat at the top of the ring sideways, because above them is the header', () => {
    expect(calloutPlacement({ left: 50, top: 8 })).toBe('right')
  })

  it('sends a seat level with the middle inboard, because outboard is the rail', () => {
    expect(calloutPlacement({ left: 13, top: 50 })).toBe('right')
    expect(calloutPlacement({ left: 87, top: 50 })).toBe('left')
  })
})

describe('which side the chips sit on', () => {
  it('always faces the middle, so a stack never falls off the table', () => {
    expect(chipSide({ left: 14.5, top: 29 })).toBe('right')
    expect(chipSide({ left: 85.5, top: 29 })).toBe('left')
  })
})
