import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const OUT = process.env.OUT ?? '/tmp/poker-preview'

/** Click a labelled segmented control in the preview's control bar. */
const pick = (page, label) =>
  page.getByRole('button', { name: label, exact: true }).first().click()

async function check(page, label, on) {
  const box = page.getByLabel(label)
  if ((await box.isChecked()) !== on) await box.click()
}

const SHOTS = [
  ['clubgg-6max', async (page) => pick(page, 'ClubGG')],
  ['house-arc-current', async (page) => pick(page, 'Ships today')],
  [
    'green-felt-house-plate',
    async (page) => {
      await pick(page, 'ClubGG')
      await pick(page, 'Green felt')
      await pick(page, 'Current')
    },
  ],
  [
    'clubgg-9max-chairs',
    async (page) => {
      await pick(page, 'ClubGG')
      await pick(page, '9')
      await check(page, 'Empty chairs', true)
    },
  ],
]

const VIEWPORTS = [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }],
]

const browser = await chromium.launch()

for (const [device, viewport] of VIEWPORTS) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/lab/table`, { waitUntil: 'networkidle' })
  for (const [name, setup] of SHOTS) {
    await setup(page)
    await page.waitForTimeout(400)
    const path = `${OUT}-${device}-${name}.png`
    await page.screenshot({ path })
    console.log(path)
  }
  await page.close()
}

await browser.close()
