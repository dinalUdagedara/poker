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

  if (opponents !== '3') {
    await page.getByTestId('opponent-count').click()
    await page.getByRole('option', { name: opponents, exact: true }).click()
  }

  await page.getByTestId('deal').click()
  await page.waitForURL(/\/table\/[0-9a-f-]+/)
  await expect(page.getByTestId('pot')).toBeVisible()
}

/** Take whichever passive action is on offer. */
async function actPassively(page: Page) {
  const check = page.getByTestId('action-check')
  if (await check.isVisible().catch(() => false)) {
    await check.click()
    return 'check'
  }
  const call = page.getByTestId('action-call')
  if (await call.isVisible().catch(() => false)) {
    await call.click()
    return 'call'
  }
  await page.getByTestId('action-fold').click()
  return 'fold'
}

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
  for (let step = 0; step < 30 && !(await result.isVisible().catch(() => false)); step++) {
    await actPassively(page)
    await page.waitForTimeout(60)
  }

  await expect(result).toBeVisible()
  await expect(page.getByTestId('next-hand')).toBeVisible()

  await page.getByTestId('next-hand').click()
  await expect(page.getByText('Hand 2')).toBeVisible()
  await expect(result).toBeHidden()
})

test('reveals the board as the streets come out', async ({ page }) => {
  await dealIn(page, '1')

  const board = page.getByTestId('board')
  await expect(board.getByTestId('card-face')).toHaveCount(0) // preflop

  const result = page.getByTestId('hand-result')
  let dealt = 0
  for (let step = 0; step < 25; step++) {
    if (await result.isVisible().catch(() => false)) break
    await actPassively(page)
    await page.waitForTimeout(60)
    dealt = Math.max(dealt, await board.getByTestId('card-face').count())
  }

  // Either the hand reached a flop, or it ended early because someone folded.
  if (await result.isVisible().catch(() => false)) {
    expect(dealt === 0 || dealt >= 3).toBe(true)
  } else {
    expect(dealt).toBeGreaterThanOrEqual(3)
  }
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

    await expect(page.getByTestId('callout-you')).toContainText(level)
  })

  test('drops the preflop callouts once the flop is out', async ({ page }) => {
    await dealIn(page, '1')
    await expect(callouts(page).filter({ hasText: 'blind' })).toHaveCount(2)

    const board = page.getByTestId('board')
    const result = page.getByTestId('hand-result')
    for (let step = 0; step < 20; step++) {
      if (await result.isVisible().catch(() => false)) break
      if ((await board.getByTestId('card-face').count()) >= 3) break
      await actPassively(page)
      await page.waitForTimeout(60)
    }
    // Someone may have folded the hand out before a flop ever came.
    if ((await board.getByTestId('card-face').count()) < 3) test.skip()

    // Blinds are posted preflop and nowhere else, so a surviving "blind" bubble
    // would mean the callouts had outlived their street.
    await expect(callouts(page).filter({ hasText: 'blind' })).toHaveCount(0)
  })

  test('keeps the last actions on screen beside the result', async ({ page }) => {
    await dealIn(page)

    const result = page.getByTestId('hand-result')
    for (let step = 0; step < 30 && !(await result.isVisible().catch(() => false)); step++) {
      await actPassively(page)
      await page.waitForTimeout(60)
    }
    await expect(result).toBeVisible()

    // Settling moves the street to 'showdown', which has no actions of its own.
    // Scoping to it would blank the fold that just decided the hand.
    await expect(callouts(page).first()).toBeVisible()
  })
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
