import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/**
 * The whole public surface, which is three URLs.
 *
 * Tables are left out on purpose: they are private, short-lived and generated
 * per game, so listing them would be advertising rooms that will 404 by the
 * time anyone follows the link.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: 'monthly', priority: 1 },
    { url: `${siteUrl}/how-to-play`, changeFrequency: 'monthly', priority: 0.8 },
    // The lobby's contents turn over constantly; the page itself does not.
    { url: `${siteUrl}/rooms`, changeFrequency: 'hourly', priority: 0.5 },
  ]
}
