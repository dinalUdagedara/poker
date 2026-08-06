/**
 * Multiplayer: two browsers, one room.
 *
 * The unit suite proves the rules. These prove the thing the unit suite cannot
 * reach — that two genuinely separate browsers, with their own cookie jars and
 * their own identities, meet at the same table and are each shown only what is
 * theirs.
 *
 * The card assertions read the wire rather than the screen on purpose. A test
 * that checks the interface draws face-down backs would still pass while the
 * server shipped everybody's hand to everybody.
 */

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * A browser belonging to somebody else.
 *
 * Its own context, which is the whole point: a context is a cookie jar, and
 * the cookie is who you are.
 */
async function newPlayer(browser: Browser): Promise<[BrowserContext, Page]> {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  return [context, await context.newPage()]
}

/** What this browser is allowed to see: who it is, and whose cards it holds. */
async function whatTheyCanSee(page: Page, tableId: string) {
  return page.evaluate(async (id) => {
    const view = await (await fetch(`/api/table/${id}`)).json()
    return {
      viewerId: view.viewerId as string | null,
      // Every player whose hole cards actually crossed the wire.
      holding: (view.players as { id: string; holeCards: unknown }[])
        .filter((player) => player.holeCards !== null)
        .map((player) => player.id),
    }
  }, tableId)
}

/** Open a public room for two, and take one of the seats. */
async function openRoomForTwo(page: Page): Promise<string> {
  await page.goto('/')
  await page.getByTestId('tab-people').click()
  await page.getByTestId('seats-2').click()
  await page.getByTestId('open-public-room').click()
  await page.waitForURL(/\/table\/[0-9a-f-]+/)
  await expect(page.getByTestId('waiting-room')).toBeVisible()
  return new URL(page.url()).pathname.split('/').pop() as string
}

/** Find that exact room in the lobby and sit down in it. */
async function joinFromTheLobby(page: Page, tableId: string) {
  await page.goto('/rooms')
  const room = page.locator(`[data-table-id="${tableId}"]`)
  await expect(room).toBeVisible()
  await expect(room).toContainText('1 of 2 seated')
  await room.getByRole('button', { name: 'Join' }).click()
  await page.waitForURL(new RegExp(`/table/${tableId}`))
}

test('two players find each other in the lobby and are dealt in together', async ({ browser }) => {
  const [aliceContext, alice] = await newPlayer(browser)
  const [bobContext, bob] = await newPlayer(browser)

  try {
    const tableId = await openRoomForTwo(alice)
    await joinFromTheLobby(bob, tableId)

    // Bob's arrival was the last seat, so the room dealt on the way in.
    await expect(bob.getByTestId('pot')).toBeVisible()

    // And Alice, who did nothing, is at the table too. Nobody refreshed
    // anything: the deal was pushed to the room she was already sitting in.
    await expect(alice.getByTestId('pot')).toBeVisible({ timeout: 15_000 })

    const forAlice = await whatTheyCanSee(alice, tableId)
    const forBob = await whatTheyCanSee(bob, tableId)

    // Two people, two identities, and each holds exactly one hand: their own.
    expect(forAlice.viewerId).not.toBeNull()
    expect(forBob.viewerId).not.toBeNull()
    expect(forAlice.viewerId).not.toBe(forBob.viewerId)
    expect(forAlice.holding).toEqual([forAlice.viewerId])
    expect(forBob.holding).toEqual([forBob.viewerId])
  } finally {
    await aliceContext.close()
    await bobContext.close()
  }
})

test('sends both players from one table to the same room when they play again', async ({
  browser,
}) => {
  const [aliceContext, alice] = await newPlayer(browser)
  const [bobContext, bob] = await newPlayer(browser)

  try {
    const tableId = await openRoomForTwo(alice)
    await joinFromTheLobby(bob, tableId)
    await expect(bob.getByTestId('pot')).toBeVisible()

    const askAgain = (page: Page) =>
      page.evaluate(
        async (id) =>
          (await (await fetch(`/api/table/${id}/rematch`, { method: 'POST' })).json()).tableId,
        tableId,
      )

    // The property the whole feature rests on. Two rooms of one would be two
    // people waiting alone for somebody who is already waiting for them.
    expect(await askAgain(bob)).toBe(await askAgain(alice))
  } finally {
    await aliceContext.close()
    await bobContext.close()
  }
})

test('tells somebody who followed a link to a full table that they are watching', async ({
  browser,
}) => {
  const [ownerContext, owner] = await newPlayer(browser)
  const [onlookerContext, onlooker] = await newPlayer(browser)

  try {
    await owner.goto('/')
    // The lobby opens on the fork between the two ways to play.
    await owner.getByTestId('tab-practice').click()
    await owner.getByTestId('deal').click()
    await owner.waitForURL(/\/table\/[0-9a-f-]+/)
    await expect(owner.getByTestId('pot')).toBeVisible()

    const tableId = new URL(owner.url()).pathname.split('/').pop() as string
    await onlooker.goto(`/table/${tableId}`)

    // Said at the top and at the bottom, because it explains everything else
    // about the screen — and no controls at all, rather than dead ones.
    await expect(onlooker.getByTestId('watching')).toBeVisible()
    await expect(onlooker.getByTestId('spectating')).toBeVisible()
    await expect(onlooker.getByTestId('action-fold')).toHaveCount(0)
    await expect(onlooker.getByTestId('next-hand')).toHaveCount(0)

    // The bug this began as: the link handed the recipient the sharer's hand.
    const forOnlooker = await whatTheyCanSee(onlooker, tableId)
    expect(forOnlooker.viewerId).toBeNull()
    expect(forOnlooker.holding).toEqual([])
  } finally {
    await ownerContext.close()
    await onlookerContext.close()
  }
})
