import type { MetadataRoute } from 'next'
import { GUIDE_PAGES } from '@/components/guide/pages'
import { siteUrl } from '@/lib/site'

/**
 * The whole public surface: the lobby, the room list, and the guide.
 *
 * The guide's pages are read from the same list the guide navigates itself
 * with, so a page added there is submitted here rather than quietly published
 * to nobody.
 *
 * Tables are left out on purpose: they are private, short-lived and generated
 * per game, so listing them would be advertising rooms that will 404 by the
 * time anyone follows the link.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: 'monthly', priority: 1 },
    ...GUIDE_PAGES.map((page) => ({
      url: `${siteUrl}${page.href}`,
      changeFrequency: 'monthly' as const,
      // The guide's front page is the one worth ranking; the rest support it.
      priority: page.href === '/how-to-play' ? 0.8 : 0.6,
    })),
    // The lobby's contents turn over constantly; the page itself does not.
    { url: `${siteUrl}/rooms`, changeFrequency: 'hourly', priority: 0.5 },
  ]
}
