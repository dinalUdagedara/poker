import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const OUT = process.env.OUT ?? '/tmp/poker-palette'

const browser = await chromium.launch()

async function shoot(page, name) {
  const path = `${OUT}-${name}.png`
  await page.screenshot({ path })
  console.log(path)
}

for (const [device, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })

  for (const [name, path] of [
    ['home', '/'],
    ['guide', '/how-to-play'],
    ['hands', '/how-to-play/hands'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)
    await shoot(page, `${device}-${name}`)
  }

  // A real dealt table, five handed, so the seats and the console are both busy.
  const tableId = await page.evaluate(async () => {
    const response = await fetch('/api/table', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ botCount: 5 }),
    })
    return (await response.json()).tableId
  })
  await page.goto(`${BASE}/table/${tableId}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await shoot(page, `${device}-table`)

  await page.close()
}

await browser.close()
