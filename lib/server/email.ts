/**
 * Sending email, through Resend's HTTP API.
 *
 * Off until `RESEND_API_KEY` is set: with no key, `hasEmail()` is false, the
 * sign-in page offers no "forgot password", and nothing tries to send. The
 * moment a key is added, password resets and address verification start
 * working with no code change.
 *
 * `RESEND_FROM` is who the mail is from. Until a domain is verified in Resend
 * it has to be Resend's own test sender, which can only deliver to the
 * address the Resend account was made with — fine for trying it, not for
 * players. Verify the site's domain in Resend and set `RESEND_FROM` to an
 * address on it before relying on this.
 */

import 'server-only'

export function hasEmail(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendEmail(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('Email is not set up: RESEND_API_KEY is missing')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM ?? 'Showdown <onboarding@resend.dev>', ...message }),
  })
  if (!response.ok) {
    // Said in the log rather than to the person asking: whether an address has
    // an account is not something a reset form should reveal.
    console.error(`[email] Resend refused a message (${response.status}): ${await response.text()}`)
    throw new Error('The email could not be sent')
  }
}

/** A plain message with one link, in the house voice, as text and as simple HTML. */
export function linkEmail(input: { greeting: string; lines: string[]; action: string; url: string; footer: string }) {
  const escape = (text: string) =>
    text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  const text = [input.greeting, '', ...input.lines, '', `${input.action}: ${input.url}`, '', input.footer].join('\n')
  const html = `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#1c211f">
<p>${escape(input.greeting)}</p>
${input.lines.map((line) => `<p>${escape(line)}</p>`).join('\n')}
<p><a href="${escape(input.url)}" style="display:inline-block;padding:12px 20px;background:#b89a5c;color:#111;text-decoration:none;border-radius:2px">${escape(input.action)}</a></p>
<p style="color:#6b716e;font-size:14px">${escape(input.footer)}</p>
</div>`
  return { text, html }
}
