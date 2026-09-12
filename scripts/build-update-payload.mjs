/**
 * Build a hot-update payload: release/update-payload/
 *   manifest.json            { version, builtAt, files: { relPath: sha256 } }
 *   <every shipped file>     dist/, electron/, config/, package.json
 *
 * Upload the WHOLE folder to the update server (e.g. waiwai-it.com/app/),
 * keeping manifest.json at its root. Clients then patch file-by-file.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const outDir = path.join(root, 'release', 'update-payload')

const PATCHABLE = ['dist', 'electron', 'config']
const files = {}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

function walk(dir, relBase) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, path.join(relBase, entry))
      continue
    }
    const rel = path.join(relBase, entry)
    const buffer = readFileSync(full)
    files[rel.split(path.sep).join('/')] = createHash('sha256').update(buffer).digest('hex')
    const target = path.join(outDir, rel)
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(full, target)
  }
}

for (const top of PATCHABLE) {
  const dir = path.join(root, top)
  if (existsSync(dir)) walk(dir, top)
}
for (const extra of ['package.json']) {
  const full = path.join(root, extra)
  if (existsSync(full)) {
    const buffer = readFileSync(full)
    files[extra] = createHash('sha256').update(buffer).digest('hex')
    copyFileSync(full, path.join(outDir, extra))
  }
}

const manifest = {
  version: pkg.version,
  builtAt: new Date().toISOString(),
  fileCount: Object.keys(files).length,
  files
}
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

console.log(`update-payload ready: ${manifest.fileCount + 1} files → ${path.relative(root, outDir)}`)
console.log(`version: ${manifest.version} · builtAt: ${manifest.builtAt}`)
console.log('Upload the whole folder to your update server (manifest.json at its root).')
