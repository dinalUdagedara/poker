import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/**
 * Three pages are worth crawling; nothing else here is a page.
 *
 * `/table/` is disallowed because those are private rooms that stop existing —
 * the pages also send `noindex`, but a crawler should not be spending requests
 * on them to find that out. `/api/` is disallowed because a crawler following
 * a link into it would be mutating a hand in progress, not reading a document.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/table/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
