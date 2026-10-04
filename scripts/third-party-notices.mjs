#!/usr/bin/env node
// Generates THIRD_PARTY_NOTICES.md at the repo root from live npm/NuGet metadata.
//
// Regenerate with: node scripts/third-party-notices.mjs
// (run from the repo root; needs `web/node_modules` installed via `npm ci`/`npm install`,
// and the NuGet global-packages cache warm from a prior `dotnet restore`/`build`.)
//
// No third-party dependencies — only Node builtins and the repo's own npm/dotnet CLIs.
// See IP-06 (tracked privately) for why this exists and what it must cover.

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const webDir = path.join(repoRoot, 'web')
const apiProject = path.join(repoRoot, 'backend', 'api', 'Heliograph.Api.csproj')

function run(cmd, args, cwd) {
  // On Windows, `npm` is a `.cmd` shim, and Node can only spawn `.cmd` files through a shell
  // (a bare execFileSync on `npm.cmd` fails with EINVAL). `shell: true` is safe here — every
  // argument below is a fixed literal from this file, never user input.
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  })
}

// ---------------------------------------------------------------------------
// web (npm) — production dependency tree
// ---------------------------------------------------------------------------

/** Recursively collects every {name, version} in an `npm ls --json` tree, deduped by name. */
function collectNpmPackages(tree) {
  const found = new Map()
  function walk(node) {
    if (!node || typeof node !== 'object') return
    const deps = node.dependencies
    if (!deps) return
    for (const [name, info] of Object.entries(deps)) {
      if (!found.has(name)) found.set(name, info.version)
      walk(info)
    }
  }
  walk(tree)
  return found
}

/** Looks for a LICENSE/LICENCE/COPYING file (any extension) in a package directory. */
function findLicenseFile(dir) {
  if (!existsSync(dir)) return null
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return null
  }
  const match = entries.find((f) => /^(license|licence|copying)(\..*)?$/i.test(f))
  if (!match) return null
  try {
    return readFileSync(path.join(dir, match), 'utf8').trim()
  } catch {
    return null
  }
}

function getNpmEntries() {
  const json = JSON.parse(run('npm', ['ls', '--omit=dev', '--all', '--json'], webDir))
  const names = collectNpmPackages(json)
  const entries = []
  for (const name of [...names.keys()].sort()) {
    const pkgDir = path.join(webDir, 'node_modules', ...name.split('/'))
    const pkgJsonPath = path.join(pkgDir, 'package.json')
    // `npm ls --all` also lists optional peer deps that resolved to nothing on this platform
    // (e.g. `ws`'s optional `bufferutil`/`utf-8-validate`, `zustand`'s optional `immer`) as an
    // entry with no version and no package.json on disk. Nothing not actually installed ships in
    // the built app, so skip it rather than recording an "UNKNOWN" phantom package.
    if (!existsSync(pkgJsonPath)) continue
    let version = names.get(name)
    let license = 'UNKNOWN'
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
      version = pkg.version ?? version
      license = pkg.license ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type).join(' OR ') : license)
    } catch {
      // leave defaults
    }
    const licenseText = findLicenseFile(pkgDir)
    entries.push({ name, version, license, licenseText })
  }
  return entries
}

// ---------------------------------------------------------------------------
// backend API (NuGet) — packages shipping in the API image
// ---------------------------------------------------------------------------

function getNugetGlobalPackagesDir() {
  const out = run('dotnet', ['nuget', 'locals', 'global-packages', '--list'], repoRoot)
  const match = out.match(/global-packages:\s*(.+)/i)
  if (!match) throw new Error(`could not parse 'dotnet nuget locals' output: ${out}`)
  return match[1].trim()
}

function readNuspecLicense(globalPackagesDir, id, version) {
  const idLower = id.toLowerCase()
  const nuspecPath = path.join(globalPackagesDir, idLower, version, `${idLower}.nuspec`)
  if (!existsSync(nuspecPath)) return { license: 'UNKNOWN', licenseUrl: null }
  const xml = readFileSync(nuspecPath, 'utf8')
  const licenseMatch = xml.match(/<license[^>]*>([^<]+)<\/license>/i)
  const urlMatch = xml.match(/<licenseUrl>([^<]+)<\/licenseUrl>/i)
  return {
    license: licenseMatch ? licenseMatch[1].trim() : 'UNKNOWN',
    licenseUrl: urlMatch ? urlMatch[1].trim() : null,
  }
}

function getNugetEntries() {
  const json = JSON.parse(run('dotnet', ['list', apiProject, 'package', '--include-transitive', '--format', 'json'], repoRoot))
  const globalPackagesDir = getNugetGlobalPackagesDir()
  const packages = new Map()
  for (const project of json.projects ?? []) {
    for (const framework of project.frameworks ?? []) {
      for (const pkg of [...(framework.topLevelPackages ?? []), ...(framework.transitivePackages ?? [])]) {
        const version = pkg.resolvedVersion ?? pkg.requestedVersion
        if (!packages.has(pkg.id)) packages.set(pkg.id, version)
      }
    }
  }
  const entries = []
  for (const id of [...packages.keys()].sort()) {
    const version = packages.get(id)
    const { license, licenseUrl } = readNuspecLicense(globalPackagesDir, id, version)
    entries.push({ name: id, version, license, licenseUrl })
  }
  return entries
}

// ---------------------------------------------------------------------------
// Markdown output
// ---------------------------------------------------------------------------

function renderNpmSection(title, entries) {
  const lines = [`## ${title}`, '']
  for (const e of entries) {
    lines.push(`### ${e.name} ${e.version}`, '', `Licence: ${e.license}`, '')
    if (e.licenseText) {
      lines.push('```', e.licenseText, '```', '')
    }
  }
  return lines.join('\n')
}

function renderNugetSection(title, entries) {
  const lines = [`## ${title}`, '']
  for (const e of entries) {
    const url = e.licenseUrl ? ` — ${e.licenseUrl}` : ''
    lines.push(`- **${e.name}** ${e.version} — ${e.license}${url}`)
  }
  return lines.join('\n') + '\n'
}

function main() {
  const npmEntries = getNpmEntries()
  const nugetEntries = getNugetEntries()

  // Fonts are self-hosted npm packages (@fontsource/*) — pulled out of the generic web-runtime
  // list into their own section per the item's grouping, with the OFL text inlined in full since
  // it's the one licence this item specifically calls out.
  const fontEntries = npmEntries.filter((e) => e.name.startsWith('@fontsource/'))
  const webRuntimeEntries = npmEntries.filter((e) => !e.name.startsWith('@fontsource/'))

  const sections = [
    '# Third-Party Notices',
    '',
    'This file lists the third-party software distributed with Heliograph, generated from',
    'live npm and NuGet metadata. Regenerate with `node scripts/third-party-notices.mjs`',
    '(see that file\'s header for prerequisites). Do not hand-edit — re-run the generator.',
    '',
    renderNpmSection('Web runtime (npm, production dependencies)', webRuntimeEntries),
    renderNugetSection('API runtime (NuGet, backend/api)', nugetEntries),
    renderNpmSection('Fonts', fontEntries),
  ]

  writeFileSync(path.join(repoRoot, 'THIRD_PARTY_NOTICES.md'), sections.join('\n').trimEnd() + '\n')
  console.log(
    `Wrote THIRD_PARTY_NOTICES.md: ${webRuntimeEntries.length} web runtime, ${nugetEntries.length} API, ${fontEntries.length} font package(s).`,
  )
}

main()
