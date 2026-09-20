/**
 * A club evening, end to end: two people, one club, one table.
 *
 * Accounts, clubs and chips need Postgres, so this suite only runs when
 * `E2E_DATABASE_URL` names a database — a Neon branch such as `dev`, never
 * production. Without it the suite is skipped and everything else runs as it
 * always has, needing nothing.
 *
 *   E2E_DATABASE_URL="$(grep ^DATABASE_URL= .env.local | cut -d= -f2-)" npm run e2e -- clubs
 *
 * Every account it makes is `e2e-…@example.com`, and all of them — with their
 * clubs, tables and chips — are deleted when it finishes.
 */

import { neon } from '@neondatabase/serverless'
import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test'

/**
 * Every step here is a few round trips to a real Postgres, which from a laptop
 * is an ocean away. Five seconds is the default for a game in memory; a buy-in
 * that settles a table and writes the ledger needs longer.
 */
const expect = baseExpect.configure({ timeout: 20_000 })

const DATABASE = process.env.E2E_DATABASE_URL
test.skip(!DATABASE, 'E2E_DATABASE_URL is not set')
test.describe.configure({ mode: 'serial' })

const stamp = Date.now()

async function person(browser: Browser, nickname: string, lacquer: number): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await page.goto('/sign-in')
  await page.getByTestId('toggle-mode').click()
  await page.getByTestId('email').fill(`e2e-${nickname.toLowerCase()}-${stamp}@example.com`)
  await page.getByTestId('password').fill('correct-horse-9')
  await page.getByTestId('submit').click()
  await page.getByTestId('nickname').fill(nickname)
  await page.getByTestId(`lacquer-${lacquer}`).click()
  await page.getByTestId('save-profile').click()
  await page.waitForURL('**/clubs')
  return page
}

/** The chips a page says its player holds in the club. */
async function balance(page: Page, code: string): Promise<number> {
  await page.goto(`/clubs/${code}`)
  return Number((await page.getByTestId('my-balance').innerText()).replace(/\D/g, ''))
}

test.afterAll(async () => {
  if (!DATABASE) return
  const sql = neon(DATABASE)
  await sql`delete from clubs where owner_id in (select id from users where email like ${`e2e-%-${stamp}@example.com`})`
  await sql`delete from users where email like ${`e2e-%-${stamp}@example.com`}`
})

test('an owner opens a club and a table, a player joins, and every chip comes back', async ({ browser }) => {
  test.setTimeout(300_000)
  const ana = await person(browser, 'Ana', 2)
  const bo = await person(browser, 'Bo', 4)

  // Ana founds the club, and makes it private.
  await ana.getByTestId('create-club').click()
  await ana.getByTestId('club-name').fill('Friday Night')
  await ana.getByTestId('visibility-private').click()
  await ana.getByTestId('create').click()
  await expect(ana.getByTestId('club-id')).toBeVisible()
  const code = ana.url().split('/').pop()!

  // So Discover does not show it, even searched for by its ID.
  await bo.goto(`/clubs/discover?q=${code}`)
  await expect(bo.getByTestId('discover-empty')).toBeVisible()
  await expect(bo.getByTestId(`discover-${code}`)).toHaveCount(0)

  // Bo asks to join from the invite link, and Ana lets him in.
  await bo.goto(`/c/${code}`)
  await bo.getByTestId('join-message').fill('Hi, it is Bo')
  await bo.getByTestId('ask-to-join').click()
  await expect(bo.getByTestId('join-pending')).toBeVisible()
  // Ana hears of it from the bell, which takes her to the request.
  await ana.goto(`/clubs/${code}`)
  await expect(ana.getByTestId('notification-count')).toHaveText('1')
  await ana.getByTestId('notification-bell').click()
  await ana.getByTestId('notification-join_request').click()
  await ana.waitForURL(`**/clubs/${code}/members?tab=applicants`)
  await expect(ana.getByTestId('notification-count')).toHaveCount(0)
  await expect(ana.getByText('Hi, it is Bo')).toBeVisible()
  await ana.locator('[data-testid^="approve-"]').first().click()
  await expect(ana.getByText('Nobody is waiting to join.')).toBeVisible()

  // Ana sends both of them chips.
  await ana.goto(`/clubs/${code}/counter`)
  await ana.getByText('Pick all').click()
  await ana.getByTestId('trade-amount').fill('10,000')
  await ana.getByTestId('send').click()
  await expect(ana.getByTestId('counter-notice')).toHaveText('Sent 20,000 to 2 members')
  await expect(ana.getByTestId('total-member-chips')).toHaveText('20,000')

  // Ana opens a table and sits down with 5,000. As the admin she adds chips
  // from the bank rather than asking herself for them.
  await ana.goto(`/clubs/${code}`)
  await expect(ana.getByTestId('add-chips')).toBeVisible()
  await expect(ana.getByTestId('ask-for-chips')).toHaveCount(0)
  await ana.getByTestId('open-table').click()
  await ana.getByTestId('table-name').fill('Friday table')
  await ana.getByTestId('blinds-4').click()
  await ana.getByTestId('open-table').click()
  await ana.waitForURL((url) => /\/tables\/[0-9a-f-]{36}$/.test(url.pathname))
  const table = ana.url()
  // Ana picks a chair on the felt rather than sitting anywhere.
  await ana.getByTestId('take-seat-3').click()
  await expect(ana.getByTestId('buy-in')).toContainText(/seat 4/i)
  await ana.getByTestId('buy-in-slider').fill('5000')
  await ana.getByTestId('confirm-buy-in').click()
  await expect(ana.getByTestId('table-status')).toContainText('Waiting for another player')

  // Bo's bell has three things for him — he was let in, sent chips, and there
  // is a table — and the newest takes him to it. He sits down; a hand is dealt.
  await bo.goto(`/clubs/${code}`)
  await expect(bo.getByTestId('notification-count')).toHaveText('3')
  await bo.getByTestId('notification-bell').click()
  await expect(bo.getByTestId('notification-chips_sent')).toContainText('You received 10,000 chips')
  await bo.getByTestId('notification-table_opened').click()
  await bo.waitForURL(table)
  await bo.getByTestId('sit-down').click()
  await bo.getByTestId('buy-in-slider').fill('5000')
  await bo.getByTestId('confirm-buy-in').click()
  await expect(bo.getByTestId('action-console')).toContainText(/turn|to act|fold/i)

  // Play the hand out: whoever is to act checks or calls.
  for (let step = 0; step < 20; step++) {
    let acted = false
    for (const page of [ana, bo]) {
      const console_ = page.getByTestId('action-console')
      if (!/Your turn/.test(await console_.innerText())) continue
      const check = page.getByRole('button', { name: /^Check/ })
      const button = (await check.count()) ? check : page.getByRole('button', { name: /^Call/ })
      await button
        .first()
        .click({ timeout: 5_000 })
        .catch(() => undefined)
      acted = true
    }
    if (!acted) {
      await ana.waitForTimeout(700)
      if (/Next hand|Waiting for another/.test(await ana.getByTestId('action-console').innerText())) break
    }
  }

  // Both stand up. The table pays them; the club's chips are all back.
  await ana.goto(table)
  await ana.getByTestId('stand-up').click()
  await bo.goto(table)
  await bo.getByTestId('stand-up').click()
  await expect(bo.getByTestId('not-seated')).toBeVisible({ timeout: 30_000 })
  await expect(async () => {
    expect((await balance(ana, code)) + (await balance(bo, code))).toBe(20_000)
  }).toPass({ timeout: 45_000 })

  // The record shows the evening: sends, buy-ins and cash-outs.
  await ana.goto(`/clubs/${code}/counter?tab=record`)
  await expect(ana.getByText('Bought in').first()).toBeVisible()
  await expect(ana.getByText('Cashed out').first()).toBeVisible()

  // Ana closes the table, and it leaves the club's list.
  await ana.goto(table)
  await ana.getByTestId('host-menu').click()
  await ana.getByTestId('close-table').click()
  await ana.getByTestId('confirm-close').click()
  await expect(ana.getByTestId('table-closed')).toBeVisible()
  await ana.goto(`/clubs/${code}`)
  await expect(ana.locator('[data-testid^="table-"]')).toHaveCount(0)
})

test('a repeating table, leaving, handing over and deleting', async ({ browser }) => {
  test.setTimeout(240_000)
  const ed = await person(browser, 'Ed', 3)
  const fi = await person(browser, 'Fi', 5)

  await ed.getByTestId('create-club').click()
  await ed.getByTestId('club-name').fill('Saturday Club')
  await ed.getByTestId('create').click()
  await expect(ed.getByTestId('club-id')).toBeVisible()
  const code = ed.url().split('/').pop()!

  // Auto-approve, so Fi is in the moment she asks.
  await ed.goto(`/clubs/${code}/members?tab=applicants`)
  await ed.getByTestId('auto-approve').check()

  // The club is public, as new clubs are, so Fi finds it in Discover — by
  // typing its ID into the search — and joins from there.
  await fi.goto('/clubs')
  await fi.getByTestId('discover-clubs').click()
  await fi.waitForURL('**/clubs/discover')
  await fi.getByTestId('discover-search').fill(code)
  await fi.waitForURL(`**/clubs/discover?q=${code}`)
  await fi.getByTestId(`discover-${code}`).click()
  await fi.waitForURL(`**/c/${code}`)
  await fi.getByTestId('ask-to-join').click()
  await fi.waitForURL(`**/clubs/${code}`)
  await fi.goto(`/clubs/discover?q=${code}`)
  await expect(fi.getByTestId(`discover-${code}`)).toContainText('Member')

  // Made private in settings, it drops out of Discover.
  await ed.goto(`/clubs/${code}/settings`)
  await ed.getByTestId('visibility-private').click()
  await ed.getByTestId('save-club').click()
  await ed.waitForURL(`**/clubs/${code}`)
  await fi.reload()
  await expect(fi.getByTestId('discover-empty')).toBeVisible()

  // A table set to repeat says so, in the lobby and at the table.
  await ed.goto(`/clubs/${code}/tables/new`)
  await ed.getByTestId('table-name').fill('Daily')
  await ed.getByTestId('hours-24').click()
  await ed.getByTestId('repeat').check()
  await ed.getByTestId('open-table').click()
  await ed.waitForURL((url) => /\/tables\/[0-9a-f-]{36}$/.test(url.pathname))
  await expect(ed.getByTestId('repeats')).toBeVisible()
  await ed.goto(`/clubs/${code}`)
  await expect(ed.getByText(/· repeats/)).toBeVisible()

  // Ed hands the club to Fi, closing the table first so Fi could delete it.
  await ed.locator('[data-testid^="table-"]').first().click()
  await ed.getByTestId('host-menu').click()
  await ed.getByTestId('stop-repeating').click()
  await expect(ed.getByTestId('repeats')).toHaveCount(0)
  await ed.getByTestId('close-table').click()
  await ed.getByTestId('confirm-close').click()
  await expect(ed.getByTestId('table-closed')).toBeVisible()
  await ed.goto(`/clubs/${code}/settings`)
  await ed.getByTestId('handover').click()
  await ed.getByTestId('confirm-handover').click()
  await ed.waitForURL(`**/clubs/${code}`)
  await expect(ed.getByTestId('admin-members')).toHaveCount(0)

  // Ed, a member now, leaves.
  await ed.getByTestId('leave-club').click()
  await ed.getByTestId('confirm-leave').click()
  await ed.waitForURL('**/clubs')
  await expect(ed.getByTestId(`club-${code}`)).toHaveCount(0)

  // Fi, the owner now, deletes the club.
  await fi.goto(`/clubs/${code}/settings`)
  await fi.getByTestId('delete-confirm-name').fill('saturday club')
  await fi.getByTestId('delete-club').click()
  await fi.waitForURL('**/clubs')
  await fi.goto(`/c/${code}`)
  await expect(fi.getByText(/not found|could not be found/i)).toBeVisible()
})

test('a stranger cannot see a club or its tables', async ({ browser }) => {
  const stranger = await person(browser, 'Cy', 1)
  await stranger.goto('/clubs/000000')
  await expect(stranger).toHaveURL(/\/clubs\/000000$/)
  await expect(stranger.getByText(/not found|could not be found/i)).toBeVisible()
})
