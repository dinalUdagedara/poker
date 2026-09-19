import { afterEach, describe, expect, it, vi } from 'vitest'

import { hasEmail, linkEmail, sendEmail } from '../email'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('email', () => {
  it('is off without a key, and refuses to send', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect(hasEmail()).toBe(false)
    await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't', html: 'h' })).rejects.toThrow()
  })

  it('sends through Resend with the key, from the configured sender', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('RESEND_FROM', 'Showdown <hello@example.com>')
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await sendEmail({ to: 'a@example.com', subject: 'Hi', text: 't', html: 'h' })

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test')
    expect(JSON.parse(init.body as string)).toMatchObject({ from: 'Showdown <hello@example.com>', to: 'a@example.com' })
  })

  it('escapes what goes into the HTML', () => {
    const { html, text } = linkEmail({
      greeting: 'Hi <b>there</b>',
      lines: ['a & b'],
      action: 'Go',
      url: 'https://example.com/?a="1"',
      footer: 'bye',
    })
    expect(html).toContain('Hi &lt;b&gt;there&lt;/b&gt;')
    expect(html).toContain('a &amp; b')
    expect(html).toContain('href="https://example.com/?a=&quot;1&quot;"')
    expect(text).toContain('Go: https://example.com/?a="1"')
  })
})
