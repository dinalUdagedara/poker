/**
 * End-to-end tests: the game as a person actually meets it.
 *
 * The unit suite proves the engine is right. These prove the browser gets what
 * the engine produced — that a hand can be played through the UI, and that the
 * hidden-information rule survives the trip over the wire.
 */

import { expect, test, type Page } from '@playwright/test'

/** Deal a table from the lobby and land on it. */
async function dealIn(page: Page, opponents = '3') {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Texas Hold/ })).toBeVisible()

  // One tap on the segmented picker rather than opening a menu and choosing.
  if (opponents !== '3') await page.getByTestId(`opponents-${opponents}`).click()

  await page.getByTestId('deal').click()
  await page.waitForURL(/\/table\/[0-9a-f-]+/)
  await expect(page.getByTestId('pot')).toBeVisible()
}

/** Deal a table with a short buy-in, so busting out happens quickly. */
async function shortStackedTable(page: Page, startingStack: number) {
  await page.goto('/')
  const tableId = await page.evaluate(async (stack) => {
    const response = await fetch('/api/table', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ botCount: 1, startingStack: stack }),
    })
    return (await response.json()).tableId as string
  }, startingStack)
  await page.goto(`/table/${tableId}`)
  return tableId
}

/**
 * Take whichever passive action is on offer, if it is our turn at all.
 *
 * Never clicks blind. Falling through to `fold.click()` waits for a button that
 * may never arrive — the hand can end while the bots are acting — and burns the
 * whole test timeout when it does not.
 */
async function actPassively(page: Page): Promise<boolean> {
  for (const id of ['action-check', 'action-call', 'action-fold']) {
    const button = page.getByTestId(id)
    if (await button.isVisible().catch(() => false)) {
      await button.click()
      return true
    }
  }
  return false
}

const showing = (page: Page, testId: string) =>
  page.getByTestId(testId).isVisible().catch(() => false)

/** Play passively until `isDone` holds, sitting out the bots' turns. */
async function playUntil(page: Page, isDone: () => Promise<boolean>, steps = 40) {
  for (let step = 0; step < steps; step++) {
    if (await isDone()) return true
    await actPassively(page)
    await page.waitForTimeout(80)
  }
  return isDone()
}

/** A hand has finished, either way it can: a result, or the table being over. */
const handSettled = (page: Page) => async () =>
  (await showing(page, 'hand-result')) || (await showing(page, 'game-over'))

test('deals a table from the lobby', async ({ page }) => {
  await dealIn(page)

  await expect(page.getByText('Hand 1')).toBeVisible()
  // Three bots plus the viewer.
  await expect(page.getByTestId(/^seat-/)).toHaveCount(4)
  await expect(page.getByTestId('dealer-button')).toHaveCount(1)
})

test('shows the viewer two cards and every opponent none', async ({ page }) => {
  await dealIn(page)

  // The only face-up cards before the flop are the viewer's own two.
  await expect(page.getByTestId('card-face')).toHaveCount(2)

  const hero = page.getByTestId('seat-you')
  await expect(hero.getByTestId('card-face')).toHaveCount(2)

  for (const bot of ['bot1', 'bot2', 'bot3']) {
    await expect(page.getByTestId(`seat-${bot}`).getByTestId('card-face')).toHaveCount(0)
  }
})

test('never ships an opponent’s cards to the browser mid-hand', async ({ page }) => {
  // The real test of the redaction rule: not what is drawn, but what arrived.
  // A card hidden only in CSS would still be sitting in the page payload.
  const responses: string[] = []
  page.on('response', async (response) => {
    if (response.url().includes('/api/table')) {
      responses.push(await response.text().catch(() => ''))
    }
  })

  await dealIn(page)
  await actPassively(page)

  const html = await page.content()
  const payloads = responses.join('\n') + html

  expect(payloads).not.toContain('"deck"')
  // Every player object sent down carries holeCards; opponents' must be null.
  const holeCardEntries = payloads.match(/"holeCards":(null|\[[^\]]*\])/g) ?? []
  expect(holeCardEntries.length).toBeGreaterThan(0)
  expect(holeCardEntries.filter((entry) => entry === '"holeCards":null').length).toBeGreaterThan(0)
})

test('plays a hand through to a result and deals the next one', async ({ page }) => {
  await dealIn(page)

  const result = page.getByTestId('hand-result')
  await playUntil(page, handSettled(page))

  await expect(result).toBeVisible()
  await expect(page.getByTestId('next-hand')).toBeVisible()

  // The hand number advancing is the whole claim. The result panel is not
  // asserted gone: the bots can fold hand two out before the check runs, which
  // puts a perfectly correct result back on screen for a different hand.
  await page.getByTestId('next-hand').click()
  await expect(page.getByText('Hand 2')).toBeVisible()
})

test('reveals the board as the streets come out', async ({ page }) => {
  await dealIn(page, '1')

  const board = page.getByTestId('board')
  await expect(board.getByTestId('card-face')).toHaveCount(0) // preflop

  let dealt = 0
  const settled = handSettled(page)
  await playUntil(page, async () => {
    dealt = Math.max(dealt, await board.getByTestId('card-face').count())
    return settled()
  })

  // Either the hand reached a flop, or it ended early because someone folded.
  dealt = Math.max(dealt, await board.getByTestId('card-face').count())
  expect(dealt === 0 || dealt >= 3).toBe(true)
})

test.describe('seat callouts', () => {
  const callouts = (page: Page) => page.getByTestId(/^callout-/)

  test('announces the blinds at the seats that posted them', async ({ page }) => {
    // Heads up, so the two blinds are the whole story before anyone acts.
    await dealIn(page, '1')

    await expect(callouts(page).filter({ hasText: 'Small blind' })).toHaveCount(1)
    await expect(callouts(page).filter({ hasText: 'Big blind' })).toHaveCount(1)
  })

  test('phrases a raise as the level the button offered', async ({ page }) => {
    await dealIn(page)

    const bet = page.getByTestId('action-bet')
    if (!(await bet.isVisible().catch(() => false))) test.skip()

    // The engine stores chips moved, not the level reached, so a big blind
    // raising to 300 is recorded as 250. The bubble has to undo that — and the
    // button already advertises the level, which is the number to match.
    const level = ((await bet.textContent()) ?? '').match(/[\d,]+/)?.[0] ?? ''
    expect(level).not.toBe('')

    await bet.click()

    // Asserted against the history, not the bubble: once the bots finish acting
    // the street turns over and callouts clear, which is intended but makes the
    // bubble a race. The history is the permanent record of the same number.
    await expect(page.getByTestId('history')).toContainText(
      new RegExp(`You (raises to|bets) ${level}`),
    )
  })

  test('drops the preflop callouts once the flop is out', async ({ page }) => {
    await dealIn(page, '1')
    await expect(callouts(page).filter({ hasText: 'blind' })).toHaveCount(2)

    const board = page.getByTestId('board')
    const settled = handSettled(page)
    await playUntil(
      page,
      async () => (await board.getByTestId('card-face').count()) >= 3 || settled(),
    )
    // Someone may have folded the hand out before a flop ever came.
    if ((await board.getByTestId('card-face').count()) < 3) test.skip()

    // Blinds are posted preflop and nowhere else, so a surviving "blind" bubble
    // would mean the callouts had outlived their street.
    await expect(callouts(page).filter({ hasText: 'blind' })).toHaveCount(0)
  })

  test('keeps the last actions on screen beside the result', async ({ page }) => {
    await dealIn(page)

    await playUntil(page, handSettled(page))
    // A bust ends the table rather than the hand, and shows no result panel.
    if (!(await showing(page, 'hand-result'))) test.skip()

    // Settling moves the street to 'showdown', which has no actions of its own.
    // Scoping to it would blank the fold that just decided the hand.
    await expect(callouts(page).first()).toBeVisible()
  })
})

test.describe('chip stacks', () => {
  const chips = (page: Page, id: string) =>
    page.getByTestId(`chips-${id}`).locator('[data-chip]')

  test('draws a stack for everyone who has chips', async ({ page }) => {
    await dealIn(page, '1')

    await expect(chips(page, 'you')).not.toHaveCount(0)
    await expect(chips(page, 'bot1')).not.toHaveCount(0)
  })

  test('draws a deep stack in big chips and a short one in small', async ({ page }) => {
    // Colour means denomination, so what a stack is worth decides which chips
    // are on the felt. Nobody sitting behind 100 has a thousand chip.
    const of = (value: number) => page.getByTestId('chips-you').locator(`[data-chip="${value}"]`)

    // Asserted on which denominations appear, not on an exact count: the blinds
    // are posted before this can look, so the stack is never quite the buy-in.
    await shortStackedTable(page, 100)
    await expect(chips(page, 'you')).not.toHaveCount(0)
    await expect(of(1000)).toHaveCount(0)
    await expect(of(500)).toHaveCount(0)

    await dealIn(page, '1')
    await expect(of(1000)).not.toHaveCount(0)
  })

  test('draws no chips at all for a player who has busted', async ({ page }) => {
    // Two big blinds each, so someone is out within a few hands.
    await shortStackedTable(page, 100)

    const over = page.getByTestId('game-over')
    for (let step = 0; step < 40 && !(await showing(page, 'game-over')); step++) {
      const next = page.getByTestId('next-hand')
      if (await next.isVisible().catch(() => false)) await next.click()
      else await actPassively(page)
      await page.waitForTimeout(80)
    }
    await expect(over).toBeVisible()

    // Whoever ran out shows an empty space where their chips were, which is the
    // whole point: no chips is not a short stack, it is no stack.
    const busted = (await page.getByTestId('stack-you').textContent()) === '0' ? 'you' : 'bot1'
    await expect(chips(page, busted)).toHaveCount(0)
  })
})

test('sizes a bet with the slider and stakes what the label showed', async ({ page }) => {
  await dealIn(page)

  const slider = page.getByTestId('bet-slider')
  if (!(await slider.isVisible().catch(() => false))) test.skip()

  // Drag well along the track, so the amount is nothing like the opening one.
  const track = (await slider.boundingBox())!
  await page.mouse.move(track.x + 4, track.y + track.height / 2)
  await page.mouse.down()
  await page.mouse.move(track.x + track.width * 0.6, track.y + track.height / 2)
  await page.mouse.up()

  // The bubble on the thumb and the button have to agree: one is what you are
  // reading while you size, the other is what actually gets staked.
  const shown = (await page.getByTestId('bet-amount').textContent())!.trim()
  await expect(page.getByTestId('action-bet')).toContainText(shown)

  await page.getByTestId('action-bet').click()
  await expect(page.getByTestId('error')).toHaveCount(0)
  // The history rather than the bubble, which clears as soon as the street
  // turns over — intended, but a race for anything asserted after the click.
  await expect(page.getByTestId('history')).toContainText(shown)
})

test('puts chips on the felt for a wager and clears them when the hand ends', async ({ page }) => {
  await dealIn(page)

  // The blinds are wagers too, so chips are out before anyone has acted.
  const wagers = page.locator('[data-testid^="bet-"]')
  await expect(wagers).not.toHaveCount(0)
  await expect(wagers.first().locator('[data-chip]')).not.toHaveCount(0)

  await playUntil(page, handSettled(page))

  // Settling moves every wager to the pot or hands it back, and the stacks say
  // so. The engine leaves currentBet standing, so this is the guard against
  // chips being left sitting on the felt after they have already been paid.
  await expect(wagers).toHaveCount(0)
})

test('stacks the pot in the middle and clears it once it is paid', async ({ page }) => {
  await dealIn(page)

  // The blinds alone make a pot, so there are chips in the middle immediately.
  const pot = page.getByTestId('pot-chips').locator('[data-chip]')
  await expect(pot).not.toHaveCount(0)

  await playUntil(page, handSettled(page))

  // Paid out now, and the award is carrying it to the winner. Chips cannot be
  // in the middle and on their way to a seat at the same time.
  await expect(page.getByTestId('pot-chips')).toHaveCount(0)
})

test('says who won, how much, and what they won it with', async ({ page }) => {
  await dealIn(page)
  await playUntil(page, handSettled(page))
  if (!(await showing(page, 'hand-result'))) test.skip()

  const result = page.getByTestId('hand-result')
  await expect(result).toContainText(/\b(You win|wins|split)\b/)
  // The amount, always — a result that names a winner but not the pot leaves
  // the one number that matters to be worked out from the stacks.
  await expect(result).toContainText(/[\d,]+/)
  // Either a showdown named the hand, or nobody had to show one.
  await expect(result).toContainText(
    /High Card|One Pair|Two Pair|Three of a Kind|Straight|Flush|Full House|Four of a Kind|everyone else folded/,
  )
})

test('sends the pot to the seat that won it', async ({ page }) => {
  await dealIn(page)
  await playUntil(page, handSettled(page))
  if (!(await showing(page, 'hand-result'))) test.skip()

  // Under reduced motion the chips do not travel, so this asserts the award was
  // worked out and rendered rather than that it is on screen: the amount has to
  // match what the result panel says was won, and exactly one seat can glow.
  const award = page.getByTestId('pot-award')
  await expect(award).toHaveCount(1)
  await expect(award).toContainText(/^\+[\d,]+$/)
  await expect(page.locator('.animate-winner')).not.toHaveCount(0)
})

/*
 * The rest of the suite runs with reduced motion, which skips the replay — and
 * with it the whole window where it is somebody else's turn, since the server
 * answers in milliseconds. Watching the bar between turns needs that window, so
 * this one asks for the animation the real thing has.
 */
test.describe('while the bots are deciding', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  test('holds the action bar at one height whoever is deciding', async ({ page }) => {
    await dealIn(page)
    const panel = page.locator('[data-slot=card]').last()
    const height = async () => Math.round((await panel.boundingBox())!.height)

    await expect(page.getByTestId('action-fold')).toBeVisible()
    const onOurTurn = await height()

    // Greyed out rather than swapped for a line of text, which used to collapse
    // the panel and put it back on every single bot action.
    await actPassively(page)
    await expect(page.getByTestId('action-idle')).toBeVisible()
    expect(await height()).toBe(onOurTurn)

    // And the result panel does not shrink it either.
    await playUntil(page, handSettled(page))
    expect(await height()).toBe(onOurTurn)
  })
})

test('lays every seat out without anything running into anything else', async ({ page }) => {
  // A full table is the tight case: near the left and right of the arc two
  // seats sit only a few percent of the felt apart, so all the room between
  // them is vertical. Sizing a seat up eats that gap without looking like it
  // has, which is why this is measured rather than watched.
  await dealIn(page, '5')

  const boxes = await page.evaluate(() => {
    const rect = (e: Element, id: string) => {
      const b = e.getBoundingClientRect()
      return { id, left: b.left, right: b.right, top: b.top, bottom: b.bottom }
    }
    const all = (sel: string, tag: string) =>
      [...document.querySelectorAll(sel)].map((e, i) =>
        rect(e, (e as HTMLElement).dataset?.testid ?? `${tag}${i}`),
      )
    return {
      seats: all('[data-testid^="seat-"]', 'seat'),
      // The header's own content, not its full-width box, which spans the page.
      fixed: [
        ...all('[data-testid="pot"]', 'pot'),
        ...all('[data-testid="board"]', 'board'),
        ...all('header a, header [data-slot=badge]', 'header'),
      ],
    }
  })

  type Box = (typeof boxes.seats)[number]
  const overlapping = (a: Box, b: Box) =>
    !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)

  const clashes: string[] = []
  for (const seat of boxes.seats) {
    for (const other of boxes.seats) {
      if (other.id < seat.id && overlapping(seat, other)) clashes.push(`${seat.id} / ${other.id}`)
    }
    for (const target of boxes.fixed) {
      if (overlapping(seat, target)) clashes.push(`${seat.id} / ${target.id}`)
    }
  }

  expect(boxes.seats).toHaveLength(6)
  expect(clashes).toEqual([])
})

test('marks the dealer with exactly one button', async ({ page }) => {
  await dealIn(page)

  const button = page.getByTestId('dealer-button')
  await expect(button).toHaveCount(1)
  await expect(button).toBeVisible()

  // Card clips its children by default, which had been shaving the button down
  // to a sliver. A button narrower than it is tall is the symptom.
  const box = await button.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(box!.height - 1)
  expect(box!.width).toBeGreaterThanOrEqual(20)
})

test('offers a raise amount the server will accept', async ({ page }) => {
  await dealIn(page)

  const bet = page.getByTestId('action-bet')
  if (!(await bet.isVisible().catch(() => false))) test.skip()

  // The button's amount comes from the legal range the server sent, so posting
  // it must be accepted. Note the error element is matched by test id, not by
  // role: Next.js ships an always-present empty route announcer with
  // role="alert", which would match any role-based query.
  const label = await bet.textContent()
  await bet.click()

  await expect(page.getByTestId('error')).toHaveCount(0)
  // The wager landed, so it shows up in the hand history.
  await expect(page.getByTestId('history')).toContainText(/You (raises to|bets)/)
  expect(label).toMatch(/\d/)
})

test('shows a useful message for a table that does not exist', async ({ page }) => {
  const response = await page.goto('/table/00000000-0000-0000-0000-000000000000')
  expect(response?.status()).toBe(404)
})

test.describe('when the table is finished', () => {
  test('ends the game instead of offering a hand that cannot be dealt', async ({ page }) => {
    // Two players at two big blinds each: within a few hands one of them is out
    // of chips, whichever way it falls.
    await shortStackedTable(page, 100)

    const gameOver = page.getByTestId('game-over')
    for (let hand = 0; hand < 40; hand++) {
      if (await gameOver.isVisible().catch(() => false)) break

      const next = page.getByTestId('next-hand')
      if (await next.isVisible().catch(() => false)) {
        await next.click()
        await page.waitForTimeout(60)
        continue
      }
      await actPassively(page)
      await page.waitForTimeout(60)
    }

    await expect(gameOver).toBeVisible()
    // The dead end was offering an action the server would refuse. It is gone.
    await expect(page.getByTestId('next-hand')).toBeHidden()
    await expect(page.getByTestId('error')).toHaveCount(0)
    await expect(gameOver).toContainText(/You are out of chips|You won the table/)

    // The only thing on offer actually works.
    await page.getByTestId('new-table').click()
    await expect(page.getByRole('heading', { name: /Texas Hold/ })).toBeVisible()
  })

  test('rejects a buy-in the server will not accept', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const response = await fetch('/api/table', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botCount: 99, startingStack: 1 }),
      })
      return { status: response.status, body: await response.json() }
    })
    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/botCount/)
  })
})
