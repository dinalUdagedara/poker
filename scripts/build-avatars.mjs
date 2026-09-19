/**
 * Draw the profile-picture gallery into `public/avatars/notionists/`.
 *
 * Notionists, by Zoish, via DiceBear — public-domain (CC0) artwork. Drawn once
 * here rather than in the browser, so the app ships thirty small SVG files and
 * no avatar library. Run again only to change the set:
 *
 *   node scripts/build-avatars.mjs
 *
 * The files are numbered, and a player's choice is stored by number, so
 * re-running with different seeds changes the faces people have already chosen.
 * Add to the end of SEEDS rather than editing it.
 */

import { mkdirSync, writeFileSync } from 'node:fs'

import { createAvatar } from '@dicebear/core'
import * as notionists from '@dicebear/notionists'

const SEEDS = [
  'Ana', 'Bo', 'Cy', 'Di', 'Ed', 'Fi', 'Gus', 'Hana', 'Ivo', 'Jin',
  'Kai', 'Lu', 'Mira', 'Nico', 'Otto', 'Pia', 'Quin', 'Rae', 'Sol', 'Tess',
  'Uma', 'Vic', 'Wren', 'Xan', 'Yara', 'Zed', 'Ari', 'Bea', 'Cato', 'Dara',
]

const out = 'public/avatars/notionists'
mkdirSync(out, { recursive: true })
SEEDS.forEach((seed, index) => {
  const svg = createAvatar(notionists, { seed, size: 128 }).toString()
  writeFileSync(`${out}/${String(index + 1).padStart(2, '0')}.svg`, svg)
})
console.log(`drew ${SEEDS.length} avatars into ${out}`)
