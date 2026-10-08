/**
 * Chipzen's pre-upload checks, run against a bundle of bot.ts.
 *
 * Their validator wants a plain JavaScript entry point it can import, and the
 * bot imports the engine as TypeScript from lib/poker, so it is bundled into
 * dist/bot.js first. The SDK stays external so the bot class extends the same
 * Bot the validator checks against. The image is built by bun from bot.ts and
 * never uses this bundle.
 */

import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

const outfile = 'dist/bot.js'

await build({
  entryPoints: ['bot.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  external: ['ws', '@chipzen-ai/bot'],
  logLevel: 'warning',
})

// The validator finds the bot class by the text `class X extends Bot`, and
// esbuild writes classes as `var X = class extends Bot`. Same class, so put
// the declaration back the way the validator reads it.
const bundle = await readFile(outfile, 'utf8')
await writeFile(outfile, bundle.replace(/^var (\w+) = class extends Bot \{/m, 'class $1 extends Bot {'))

const result = spawnSync('npx', ['chipzen-sdk', 'validate', 'dist', '--check-connectivity'], {
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
