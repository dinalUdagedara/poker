import { expect, test } from '@playwright/test'

/**
 * The guide is five static pages, so there is very little that can break at
 * runtime — except the one thing a build cannot catch. Invalid nesting (a card,
 * which is a div, inside a paragraph) builds and renders happily on the server,
 * then the browser moves the node while parsing and React finds a tree it did
 * not write. That is a console error and a silently different layout, on pages
 * nobody is watching closely because they are "just content".
 *
 * So this walks every page and asserts the browser had nothing to say.
 */
const GUIDE_PATHS = [
  '/how-to-play',
  '/how-to-play/hands',
  '/how-to-play/betting',
  '/how-to-play/strategy',
  '/how-to-play/rooms',
]

for (const path of GUIDE_PATHS) {
  test(`renders ${path} without complaint from the browser`, async ({ page }) => {
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        problems.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

    await page.goto(path)
    // The heading is server-rendered; waiting for it means hydration has had
    // its chance to disagree before anything is asserted.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle')

    expect(problems).toEqual([])
  })
}

test('links every section of the guide from every page of it', async ({ page }) => {
  // The pills are the only way between these pages, and they live in a layout
  // that is easy to forget when a page is added.
  await page.goto('/how-to-play/rooms')

  const nav = page.getByRole('navigation', { name: 'Guide sections' })
  for (const path of GUIDE_PATHS) {
    await expect(nav.locator(`a[href="${path}"]`)).toBeVisible()
  }

  await nav.locator('a[href="/how-to-play/betting"]').click()
  await expect(page).toHaveURL(/\/how-to-play\/betting$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Betting' })).toBeVisible()
})
